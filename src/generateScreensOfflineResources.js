/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { outputFile } from 'fs-extra';
import GitUtils from './utils/gitUtils.js';
import ManifestGenerator from './createManifest.js';
import FetchUtils from './utils/fetchUtils.js';
import ChannelHtmlGenerator from './channelHtmlGenerator/channelHtmlGenerator.js';
import PathUtils from './utils/pathUtils.js';

export default class GenerateScreensOfflineResources {
  /**
   * Parse command line arguments
   */
  static parseArgs = (args) => {
    const parsedArgs = {};
    if (Array.isArray(args)) {
      args.forEach((arg) => {
        const parts = arg.split('=');
        const [key, value] = parts;
        parsedArgs[key] = value;
      });
    }
    return parsedArgs;
  };

  static processLiveUrl = (liveUrl) => {
    try {
      const url = new URL(liveUrl);
      url.pathname = `${url.pathname}.html`;
      return url.toString();
    } catch (err) {
      /* eslint-disable no-console */
      console.warn(`Invalid live url: ${liveUrl}`, err);
    }
    return liveUrl;
  };

  /**
   * Create ChannelMap from the helix channels list
   */
  static createChannelMap = (channelsData) => {
    const channelsMap = new Map();
    for (let i = 0; i < channelsData.length; i++) {
      const channelPath = channelsData[i].path;
      const channelData = {};
      channelData.externalId = channelsData[i].externalId;
      channelData.liveUrl = GenerateScreensOfflineResources
        .processLiveUrl(channelsData[i].liveUrl);

      channelData.editUrl = channelsData[i].editUrl;
      channelData.title = channelsData[i].title;
      channelsMap.set(channelPath, channelData);
    }
    return channelsMap;
  };

  /**
   * Create offline resources
   */
  static createOfflineResources = async (
    host,
    jsonManifestData,
    channelsListData,
    generateLoopingHtml,
    updatedHtmls = [],
    sequenceAssets = {},
    includeCarousel = []
  ) => {
    const manifests = JSON.parse(jsonManifestData);
    const channelsList = JSON.parse(channelsListData);
    const totalManifests = parseInt(manifests.total, 10);
    const manifestData = manifests.data;
    const channelsData = channelsList.data;
    const channelsMap = GenerateScreensOfflineResources.createChannelMap(channelsData);
    const channelJson = {};
    channelJson.channels = [];
    channelJson.metadata = {};
    channelJson.metadata.providerType = 'franklin';
    for (let i = 0; i < totalManifests; i++) {
      const data = manifestData[i];
      const updateHtml = updatedHtmls.includes(data.path);
      const hasCarousel = includeCarousel.includes(data.path);
      /* eslint-disable no-await-in-loop */
      const [manifest, lastModified] = await ManifestGenerator
        .createManifest(host, data, generateLoopingHtml && hasCarousel, updateHtml, sequenceAssets[data.path]);
      const channelEntry = {};
      channelEntry.manifestPath = `${manifestData[i].path}.manifest.json`;
      channelEntry.lastModified = new Date(lastModified);
      const hierarchy = PathUtils.getParentHierarchy(manifestData[i].path);
      channelEntry.hierarchy = hierarchy;
      if (channelsMap.get(manifestData[i].path)) {
        channelEntry.externalId = channelsMap.get(manifestData[i].path).externalId
          ? channelsMap.get(manifestData[i].path).externalId : '';
        channelEntry.title = channelsMap.get(manifestData[i].path).title
          ? channelsMap.get(manifestData[i].path).title : '';
        channelEntry.liveUrl = channelsMap.get(manifestData[i].path).liveUrl
          ? channelsMap.get(manifestData[i].path).liveUrl : '';
        if(channelsMap.get(manifestData[i].path).editUrl) {
          channelEntry.editUrl = channelsMap.get(manifestData[i].path).editUrl;
        }
      } else {
        channelEntry.externalId = manifestData[i].path;
        channelEntry.liveUrl = FetchUtils.createUrlFromHostAndPath(host, manifestData[i].path);
        channelEntry.title = '';
      }
      channelJson.channels.push(channelEntry);
      let manifestFilePath = '';
      manifestFilePath = `${manifestData[i].path.substring(1, manifestData[i].path.length)}.manifest.json`;
      outputFile(manifestFilePath, JSON.stringify(manifest, null, 2), (err) => {
        if (err) {
          /* eslint-disable no-console */
          console.log(err);
        }
      });
    }
    console.log("Manifests written");
    outputFile('screens/channels.json', JSON.stringify(channelJson, null, 2), (err) => {
      if (err) {
        /* eslint-disable no-console */
        console.log(err);
      }
    });
  };

  static run = async (args) => {
    const parsedArgs = GenerateScreensOfflineResources.parseArgs(args);
    const helixManifest = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const helixChannelsList = parsedArgs.helixChannelsList
      ? `${parsedArgs.helixChannelsList}.json` : '/channels.json';
    let generateLoopingHtml = false;
    if (parsedArgs.generateLoopingHtml === 'true') {
      generateLoopingHtml = true;
    }
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), { });
    const gitBranch = await GitUtils.getBranch(process.cwd());
    const host = parsedArgs.customDomain || `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.hlx.live`;
    const manifests = await FetchUtils.fetchData(
      host,
      helixManifest,
      { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey }
    );
    const channelsList = await FetchUtils.fetchData(
      host,
      helixChannelsList,
      { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey }
    );
    let sequenceDetails = {};
    sequenceDetails = await ChannelHtmlGenerator.generateChannelHTML(JSON.parse(manifests), host, generateLoopingHtml);

    await GenerateScreensOfflineResources.createOfflineResources(
      host,
      manifests,
      channelsList,
      generateLoopingHtml,
      sequenceDetails.updatedHtmls,
      sequenceDetails.assetsLinks,
      sequenceDetails.includeCarousel
    );
  };
}
