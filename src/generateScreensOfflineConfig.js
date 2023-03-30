import fetch from 'node-fetch';
import { outputFile } from 'fs-extra';
import GitUtils from './git-utils.js';
import CreateManifest from './createManifest.js';

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
    const manifests = await GenerateScreensOfflineConfig.fetchData(helixManifestPath);
    const channelsList = await GenerateScreensOfflineConfig.fetchData(helixChannelsListPath);
    await GenerateScreensOfflineConfig.createManifests(url, manifests, channelsList);
  }

  static async fetchData(path) {
    let result = '';
    try {
      result = fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`request to fetch ${path} failed with status code ${response.status}`);
          }
          return response.text();
        });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${path} failed with status code with error ${e}`);
    }
  }

  static createChannelMap(channelsData) {
    const channelsMap = new Map();
    for (let i = 0; i < channelsData.length; i++) {
      const channelPath = channelsData[i].path;
      const channelData = new Map();
      channelData.set('externalId', channelsData[i].externalId);
      channelData.set('liveUrl', channelsData[i].liveUrl);
      channelData.set('editUrl', channelsData[i].editUrl);
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
      channelEntry.manifestPath = `${manifestData[i].path}.manifest.json`;
      channelEntry.lastModified = new Date(lastModified);
      if (channelsMap.get(manifestData[i].path)) {
        channelEntry.externalId = channelsMap.get(manifestData[i].path).get('externalId');
        channelEntry.liveUrl = channelsMap.get(manifestData[i].path).get('liveUrl');
      } else {
        channelEntry.externalId = manifestData[i].path;
        channelEntry.liveUrl = `${url}${manifestData[i].path}`;
      }
      channelJson.channels.push(channelEntry);
      outputFile(`${manifestData[i].path.substring(1, manifestData[i].path.length)}.manifest.json`, JSON.stringify(manifest, null, 2), (err) => {
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
