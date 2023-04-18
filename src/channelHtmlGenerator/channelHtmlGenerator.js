import fs from 'fs';
import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { outputFile } from 'fs-extra';

import {scriptText} from './carouselResources/carouselScript.js';
import DateUtils from './../utils/dateUtils.js';
import FetchUtils from '../utils/fetchUtils.js';
import GitUtils from "../utils/gitUtils.js";

export default class ChannelHtmlGenerator {

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

  static createCarousel = (assets = []) => {
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
    const sheetDetails = [];
    if (!container || !container.children()) {
      return sheetDetails;
    }
    // fetch from google doc format
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
    if (sheetDetails.length === 0) {
      // fetch from sharepoint format now
      let skipParentProcessing = true;
      try {
        container.find('div:first-child').each((index, element) => {
          if (skipParentProcessing) {
            skipParentProcessing = false;
            return;
          }
          const name = $(element).text();
          const link = $(element).next().text();
          if (name && link) {
            sheetDetails.push({
              name: name,
              link: link
            });
          }
        });
      } catch (err) {
        console.warn(`Invalid word doc row`, err);
      }
    }
    return sheetDetails;
  }

  static validateLinkAndGetContentType = async (link) => {
    const response = await fetch(link, {method: 'HEAD'});
    if (response.status !== 200) {
      throw new Error(`Invalid asset link: ${link}, Received status: ${response.status}`);
    }
    let contentType = response.headers.get('content-type');
    console.log(`Content type for link ${link}: ${contentType}`);
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
      const channelHtml = await FetchUtils.fetchDataFromUrl(url + channelPath);

      const sheetDetails = ChannelHtmlGenerator.extractSheetData(channelHtml) || [];
      if (sheetDetails.length === 0) {
        console.warn(`No sheet data available during HTML generation`);
      }
      const assets = [];
      let errorFlag = false;
      for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex++) {
        try {
          const sheetDataResponse = JSON.parse(await FetchUtils.fetchDataFromUrl(sheetDetails[sheetIndex].link));
          if (!sheetDataResponse) {
            console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.
                      Skipping processing this one.`);
            return;
          }
          const sheetName = sheetDetails[sheetIndex].name;
          const sheetData = ChannelHtmlGenerator.processSheetDataResponse(sheetDataResponse, sheetName);
          for (let row = 0; row < sheetData.length; row++) {
            const assetDetails = sheetData[row];
            const contentType = await ChannelHtmlGenerator.validateLinkAndGetContentType(assetDetails['Link']);
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
              'type': contentType,
              'isGMT': DateUtils.isGMT(assetDetails['Timezone'])
            });
          }
        } catch (err) {
          errorFlag = true;
          console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
        }
      }
      if (assets.length === 0 && errorFlag) {
        // Don't create HTML with no assets when there was an error
        return;
      }
      const carouselHtml = ChannelHtmlGenerator.createCarousel(assets);
      const relativeChannelPath = channelPath.slice(1);
      outputFile(`${relativeChannelPath}.html`, carouselHtml, (err) => {
        if (err) {
          console.error(err);
        }
      });
      console.log(`HTML saved at ${relativeChannelPath}.html`);
      if (await GitUtils.isFileDirty(`${relativeChannelPath}.html`)) {
        console.log(`Git: Existing html at ${relativeChannelPath}.html is different from generated html.`);
        return channelPath;
      }
    }));
  }
}
