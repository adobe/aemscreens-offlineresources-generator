import fs from 'fs';
import cheerio from 'cheerio';
import { outputFile } from 'fs-extra';
import scriptText from './carouselResources/carouselScript.js';
import DateUtils from '../utils/dateUtils.js';
import FetchUtils from '../utils/fetchUtils.js';
import GitUtils from '../utils/gitUtils.js';

export default class ChannelHtmlGenerator {
  static createCSS = () => {
    let cssText = '';
    try {
      const cssPath = `${process.cwd()}/node_modules/@aem-screens/screens-offlineresources-generator/`
        + 'src/channelHtmlGenerator/carouselResources/carousel.css';
      cssText = fs.readFileSync(cssPath, 'utf8');
    } catch (err) {
      console.error(err);
    }
    return cssText;
  };

  static createScript = (assets) => {
    let scriptString = scriptText.toString();
    scriptString = scriptString.substring(scriptString.indexOf('{') + 1);
    scriptString = scriptString.slice(0, -1);
    const assetsJson = JSON.stringify(assets);
    scriptString = `const assets = JSON.parse('${assetsJson}');${scriptString}`;
    return scriptString;
  };

  static createCarousel = (assets = []) => {
    const scriptString = ChannelHtmlGenerator.createScript(assets);
    const cssString = ChannelHtmlGenerator.createCSS();
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
  };

  static extractSheetData = (channelHtml) => {
    // Parse the HTML response into a DOM element
    const $ = cheerio.load(channelHtml);
    const container = $('.locations');
    const sheetDetails = [];
    if (!container || !container.children()) {
      console.warn('No carousel data found while extracting sheet data.');
      return sheetDetails;
    }
    let skipParentProcessing = true;
    try {
      container.find('div:first-child').each((index, element) => {
        try {
          if (skipParentProcessing) {
            skipParentProcessing = false;
            return;
          }
          const name = $(element).text();
          const link = $(element).next().text();
          if (name && link) {
            sheetDetails.push({
              name,
              link
            });
          }
        } catch (err) {
          console.warn(`Exception while processing row ${index}`, err);
        }
      });
    } catch (err) {
      console.warn('Exception while extracting sheet data', err);
    }
    return sheetDetails;
  };

  static validateExtensionAndGetMediaType = (link) => {
    const supportedImageFormats = ['.png', '.jpg', '.jpeg', '.raw', '.tiff'];
    const supportedVideoFormats = ['.mp4', '.wmv', '.avi', '.mpg', '.m4v'];
    let mediaType;
    supportedImageFormats.forEach((format) => {
      if (link.includes(format)) {
        mediaType = 'image';
      }
    });
    supportedVideoFormats.forEach((format) => {
      if (link.includes(format)) {
        mediaType = 'video';
      }
    });
    if (mediaType) {
      return mediaType;
    }
    throw new Error(`Incompatible asset format: ${link}`);
  };

  static processSheetDataResponse = (sheetDataResponse, sheetName) => {
    let data;
    if (sheetDataResponse[':type'] === 'multi-sheet') {
      data = sheetDataResponse[sheetName].data;
    } else if (sheetDataResponse[':type'] === 'sheet') {
      data = sheetDataResponse.data;
    } else {
      throw new Error(`Invalid sheet type: ${sheetDataResponse[':type']}`);
    }
    return data;
  };

  static getPathNameFromLink = (link) => {
    const linkUrl = new URL(link);
    return linkUrl.pathname;
  };

  static generateChannelHTML = async (channels, host, generateLoopingHtml = false) => {
    if (!channels || !Array.isArray(channels.data)) {
      console.error(`HTML generation failed. Invalid channels: ${JSON.stringify(channels)}`);
      return {};
    }
    const assetsLinks = {};
    const updatedHtmls = [];
    const includeCarousel = [];
    for (let index = 0; index < channels.data.length; index++) {
      const channelData = channels.data[index];
      if (!channelData) {
        console.warn(`Invalid channel data during html generation: ${channelData}`);
        return {};
      }
      const channelPath = channelData.path;
      /* eslint-disable no-await-in-loop */
      const channelHtml = await FetchUtils.fetchDataFromUrl(
        host + channelPath,
        { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey }
      );
      let generatedHtml = channelHtml;
      if (generateLoopingHtml) {
        const sheetDetails = ChannelHtmlGenerator.extractSheetData(channelHtml) || [];
        if (sheetDetails.length === 0) {
          console.warn('No sheet data available during HTML generation');
        } else {
          includeCarousel.push(channelPath);
          const assets = [];
          let errorFlag = false;
          for (let sheetIndex = 0; sheetIndex < sheetDetails.length; sheetIndex++) {
            try {
              const sheetLinkUrl = new URL(sheetDetails[sheetIndex].link);
              const sheetDataResponse = JSON.parse(await FetchUtils.fetchDataFromUrl(
                host + sheetLinkUrl.pathname,
                { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey }
              ));
              if (!sheetDataResponse) {
                console.warn(`Invalid sheet Link ${JSON.stringify(sheetDetails[sheetIndex])}.
                      Skipping processing this one.`);
                continue;
              }
              const sheetName = sheetDetails[sheetIndex].name;
              const sheetData = ChannelHtmlGenerator.processSheetDataResponse(sheetDataResponse, sheetName);
              for (let row = 0; row < sheetData.length; row++) {
                try {
                  const assetDetails = sheetData[row];
                  const contentType = ChannelHtmlGenerator.validateExtensionAndGetMediaType(assetDetails.Link);
                  DateUtils.validateTimeFormat(assetDetails['Start Time']);
                  DateUtils.validateTimeFormat(assetDetails['End Time']);
                  DateUtils.validateDateFormat(assetDetails['Launch Start']);
                  DateUtils.validateDateFormat(assetDetails['Launch End']);
                  assets.push({
                    link: ChannelHtmlGenerator.getPathNameFromLink(assetDetails.Link),
                    startTime: assetDetails['Start Time'],
                    endTime: assetDetails['End Time'],
                    launchStartDate: assetDetails['Launch Start'],
                    launchEndDate: assetDetails['Launch End'],
                    type: contentType,
                    isGMT: DateUtils.isGMT(assetDetails.Timezone)
                  });
                } catch (err) {
                  console.warn(`Error while processing asset ${JSON.stringify(sheetData[row])}`, err);
                }
              }
            } catch (err) {
              errorFlag = true;
              console.warn(`Error while processing sheet ${JSON.stringify(sheetDetails[sheetIndex])}`, err);
            }
          }
          if (assets.length === 0 && errorFlag) {
            // Don't create HTML with no assets when there was an error
            console.log('Skipping HTML generation due to assets length zero along with error occurrence');
            continue;
          }
          generatedHtml = ChannelHtmlGenerator.createCarousel(assets);
          assetsLinks[channelPath] = assets.map((asset) => asset.link);
        }
      }
      const relativeChannelPath = channelPath.slice(1);
      outputFile(`${relativeChannelPath}.html`, generatedHtml, (err) => {
        if (err) {
          console.error(err);
        }
      });
      console.log(`HTML saved at ${relativeChannelPath}.html`);
      /* eslint-disable no-await-in-loop */
      if (await GitUtils.isFileDirty(`${relativeChannelPath}.html`)) {
        console.log(`Git: Existing html at ${relativeChannelPath}.html is different from generated html.`);
        updatedHtmls.push(channelPath);
      }
    }
    return { updatedHtmls, assetsLinks, includeCarousel };
  };
}
