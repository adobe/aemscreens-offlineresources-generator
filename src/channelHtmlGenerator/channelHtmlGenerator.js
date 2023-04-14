import fs from 'fs';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { outputFile } from 'fs-extra';

import {scriptText} from './carouselResources/carouselScript.js';
import DateUtils from './../utils/dateUtils.js';
import FetchUtils from '../utils/fetchUtils.js';
import GitUtils from "../utils/gitUtils.js";

export default class ChannelHtmlGenerator {
  static getContentType = async (assetLink) => {
    const resp = await fetch(assetLink, {method: 'HEAD'});
    if (resp && resp.headers) {
      return resp.headers.get('content-type');
    }
  }

  static createCSS = () => {
    let cssText = '';
    try {
      const cssPath = process.cwd() + '/node_modules/@aem-screens/screens-offlineresources-generator/' +
          'src/channelHtmlGenerator/carouselResources/carousel.css';
      cssText = fs.readFileSync(cssPath, 'utf8');
    } catch (err) {
      console.error(err);
    }
    return cssText;
  }

  static createScript = (assets) => {
    let scriptString = scriptText.toString();
    scriptString = scriptString.substring(scriptString.indexOf('{') + 1);
    scriptString = scriptString.slice(0, -1);
    let assetsJson = JSON.stringify(assets);
    scriptString = `const assets = JSON.parse('${assetsJson}');` + scriptString;
    return scriptString;
  }

  static createCarousel = (assets) => {
    if (!Array.isArray(assets) || assets.length === 0) {
      return;
    }
    let scriptString = ChannelHtmlGenerator.createScript(assets);
    let cssString = ChannelHtmlGenerator.createCSS();
    return `<html lang="en-US">
             <head>
               <title></title>
               <script type="module">${scriptString}</script>
               <style>${cssString}</style>
             </head>
             <body>
               <div id="carousel-container"></div>
             </body>
           </html>`;
  }

  static extractSheetData = (channelHtml) => {
    // Parse the HTML response into a DOM element
    const $ = cheerio.load(channelHtml);
    const container = $('.locations');
    if (!container || !container.children()) {
      return;
    }
    const sheetDetails = [];
    Array.from(container.children()).forEach((element) => {
      try {
        if (element.children[1].children[0].data && element.children[3].children[0].data) {
          sheetDetails.push({
            name: element.children[1].children[0].data,
            link: element.children[3].children[0].data
          })
        }
      } catch (err) {
        console.warn(`Invalid word doc row`, err);
      }
    });
    return sheetDetails;
  }

  static processContentType = (contentType) => {
    let type;
    if (contentType && contentType.includes('video')) {
      type = 'video';
    } else if (contentType && contentType.includes('image')) {
      type = 'image';
    } else {
      throw new Error(`Invalid asset content-type: ${contentType}`);
    }
    return type;
  }

  static validateAssetLink = async (link) => {
    const response = await fetch(link, {method: 'HEAD'});
    if (response.status !== 200) {
      throw new Error(`Invalid asset link: ${link}`);
    }
  }

  static processSheetDataResponse = (sheetDataResponse, sheetName) => {
    if (sheetDataResponse[':type'] === 'multi-sheet') {
      return sheetDataResponse[sheetName].data;
    } else if (sheetDataResponse[':type'] === 'sheet') {
      return sheetDataResponse.data;
    } else {
      throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
    }
  }

  static generateChannelHTML = async (channels, url) => {

    if (!channels || !Array.isArray(channels.data)) {
      console.error(`HTML generation failed. Invalid channels: ${JSON.stringify(channels)}`);
      return;
    }
    return await Promise.all(channels.data.map(async (channelData) => {
      if (!channelData) {
        console.warn(`Invalid channel data during html generation: ${channelData}`);
        return;
      }
      const channelPath = channelData.path;
      const channelHtml = await FetchUtils.fetchData(url + channelPath);

      const sheetDetails = ChannelHtmlGenerator.extractSheetData(channelHtml);
      if (!Array.isArray(sheetDetails) || sheetDetails.length === 0) {
        console.warn(`No sheet data available during HTML generation`);
        return;
      }
      const assets = [];
      for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex++) {
        try {
          const sheetDataResponse = JSON.parse(await FetchUtils.fetchData(sheetDetails[sheetIndex].link));
          if (!sheetDataResponse) {
            console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.
                      Skipping processing this one.`);
            return;
          }
          const sheetName = sheetDetails[sheetIndex].name;
          const sheetData = ChannelHtmlGenerator.processSheetDataResponse(sheetDataResponse, sheetName);
          for (let row = 0; row < sheetData.length; row++) {
            const assetDetails = sheetData[row];
            const contentType = await ChannelHtmlGenerator.getContentType(assetDetails['Link']);
            const type = ChannelHtmlGenerator.processContentType(contentType);
            await ChannelHtmlGenerator.validateAssetLink(assetDetails['Link']);
            DateUtils.validateTimeFormat(assetDetails['Start Time']);
            DateUtils.validateTimeFormat(assetDetails['End Time']);
            DateUtils.validateDateFormat(assetDetails['Launch Start']);
            DateUtils.validateDateFormat(assetDetails['Launch End']);
            assets.push({
              'link': assetDetails['Link'],
              'startTime': assetDetails['Start Time'],
              'endTime': assetDetails['End Time'],
              'launchStartDate': assetDetails['Launch Start'],
              'launchEndDate': assetDetails['Launch End'],
              'type': type,
              'isGMT': DateUtils.isGMT(assetDetails['Timezone'])
            });
          }
        } catch (err) {
          console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
        }
      }
      const carouselHtml = ChannelHtmlGenerator.createCarousel(assets);
      console.log('HTML generated successfully');
      outputFile(`internal${channelPath}.html`, carouselHtml, (err) => {
        if (err) {
          console.error(err);
        }
      });
      console.log(`HTML saved at internal${channelPath}.html`);
      if (await GitUtils.isFileDirty(`internal${channelPath}.html`)) {
        console.log('file dirty');
        return channelPath;
      }
    }));
  }
}
