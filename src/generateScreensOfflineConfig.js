import { outputFile } from 'fs-extra';
import GitUtils from './utils/gitUtils.js';
import CreateManifest from './createManifest.js';
import ChannelHtmlGenerator from './channelHtmlGenerator/channelHtmlGenerator.js';
import FetchUtils from "./utils/fetchUtils.js";

export default class GenerateScreensOfflineConfig {
  static parseArgs(args) {
    const parsedArgs = {};
    args.forEach((arg) => {
      const parts = arg.split('=');
      const [key, value] = parts;
      parsedArgs[key] = value;
    });
    return parsedArgs;
  }

  static async run(args) {
    const parsedArgs = GenerateScreensOfflineConfig.parseArgs(args);
    const helixManifest = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const helixChannelsList = parsedArgs.helixChannelsList ? `${parsedArgs.helixChannelsList}.json` : '/channels.json';
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), { });
    const gitBranch = await GitUtils.getBranch(process.cwd());
    const url = `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.hlx.live`;
    const helixManifestPath = `${url}${helixManifest}`;
    const helixChannelsListPath = `${url}${helixChannelsList}`;
    const manifests = await FetchUtils.fetchData(helixManifestPath);
    const channelsList = await FetchUtils.fetchData(helixChannelsListPath);
    if (parsedArgs.generateLoopingHtml) {
      const htmls = await ChannelHtmlGenerator.generateChannelHTML(JSON.parse(manifests), url);
      console.log(JSON.stringify(htmls));
    }
    await GenerateScreensOfflineConfig.createManifests(url, manifests, channelsList);
  }

  static processLiveUrl(liveUrl) {
    try {
      const url = new URL(liveUrl);
      url.pathname = `/internal${url.pathname}.html`;
      return url.toString();
    } catch (err) {
      console.warn(`Invalid live url: ${liveUrl}`, err);
    }
    return liveUrl;
  }

  static createChannelMap(channelsData) {
    const channelsMap = new Map();
    for (let i = 0; i < channelsData.length; i++) {
      const channelPath = channelsData[i].path;
      const channelData = new Map();
      channelData.set('externalId', channelsData[i].externalId);
      channelData.set('liveUrl', GenerateScreensOfflineConfig.processLiveUrl(channelsData[i].liveUrl));
      channelData.set('editUrl', channelsData[i].editUrl);
      channelData.set('title', channelsData[i].title);
      channelsMap.set(channelPath, channelData);
    }
    return channelsMap;
  }

  static async createManifests(url, jsonManifestData, channelsListData) {
    const manifests = JSON.parse(jsonManifestData);
    const channelsList = JSON.parse(channelsListData);
    const totalManifests = parseInt(manifests.total, 10);
    const manifestData = manifests.data;
    const channelsData = channelsList.data;
    const channelsMap = GenerateScreensOfflineConfig.createChannelMap(channelsData);
    const channelJson = {};
    channelJson.channels = [];
    for (let i = 0; i < totalManifests; i += 1) {
      /* eslint-disable no-await-in-loop */
      const [manifest, lastModified] = await CreateManifest.createManifest(url, manifestData[i]);
      const channelEntry = {};
      channelEntry.manifestPath = `/internal${manifestData[i].path}.manifest.json`;
      channelEntry.lastModified = new Date(lastModified);
      if (channelsMap.get(manifestData[i].path)) {
        channelEntry.externalId = channelsMap.get(manifestData[i].path).get('externalId');
        channelEntry.liveUrl = channelsMap.get(manifestData[i].path).get('liveUrl');
        channelEntry.title = channelsMap.get(manifestData[i].path).get('title');
      } else {
        channelEntry.externalId = manifestData[i].path;
        channelEntry.liveUrl = `${url}${manifestData[i].path}`;
        channelEntry.title = ' ';
      }
      channelJson.channels.push(channelEntry);
      outputFile(`internal${manifestData[i].path}.manifest.json`, JSON.stringify(manifest, null, 2), (err) => {
        if (err) {
          /* eslint-disable no-console */
          console.log(err);
        }
      });
    }
    outputFile('screens/channels.json', JSON.stringify(channelJson, null, 2), (err) => {
      if (err) {
        /* eslint-disable no-console */
        console.log(err);
      }
    });
  }
}
