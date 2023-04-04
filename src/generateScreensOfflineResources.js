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
import GitUtils from './git-utils.js';
import ManifestGenerator from './createManifest.js';
import Utils from './utils.js';

export default class GenerateScreensOfflineResources {
  /**
   * Parse command line arguments
   */
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
    const parsedArgs = GenerateScreensOfflineResources.parseArgs(args);
    const helixManifest = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const helixChannelsList = parsedArgs.helixChannelsList ? `${parsedArgs.helixChannelsList}.json` : '/channels.json';
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), { });
    const gitBranch = await GitUtils.getBranch(process.cwd());
    const host = `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.hlx.live`;
    const manifests = await Utils.fetchData(host, helixManifest);
    const channelsList = await Utils.fetchData(host, helixChannelsList);
    await GenerateScreensOfflineResources.createOfflineResources(host, manifests, channelsList);
  }

  /**
   * Create ChannelMap from the helix channels list
   */
  static createChannelMap(channelsData) {
    const channelsMap = new Map();
    for (let i = 0; i < channelsData.length; i++) {
      const channelPath = channelsData[i].path;
      const channelData = new Map();
      channelData.set('externalId', channelsData[i].externalId);
      channelData.set('liveUrl', channelsData[i].liveUrl);
      channelData.set('editUrl', channelsData[i].editUrl);
      channelData.set('title', channelsData[i].title);
      channelsMap.set(channelPath, channelData);
    }
    return channelsMap;
  }

  /**
   * Create offline resources
   */
  static async createOfflineResources(host, jsonManifestData, channelsListData) {
    const manifests = JSON.parse(jsonManifestData);
    const channelsList = JSON.parse(channelsListData);
    const totalManifests = parseInt(manifests.total, 10);
    const manifestData = manifests.data;
    const channelsData = channelsList.data;
    const channelsMap = GenerateScreensOfflineResources.createChannelMap(channelsData);
    const channelJson = {};
    channelJson.channels = [];
    for (let i = 0; i < totalManifests; i++) {
      const data = manifestData[i];
      /* eslint-disable no-await-in-loop */
      const [manifest, lastModified] = await ManifestGenerator.createManifest(host, data);
      const channelEntry = {};
      channelEntry.manifestPath = `${manifestData[i].path}.manifest.json`;
      channelEntry.lastModified = new Date(lastModified);
      if (channelsMap.get(manifestData[i].path)) {
        channelEntry.externalId = channelsMap.get(manifestData[i].path).get('externalId')
          ? channelsMap.get(manifestData[i].path).get('externalId') : '';
        channelEntry.title = channelsMap.get(manifestData[i].path).get('title')
          ? channelsMap.get(manifestData[i].path).get('title') : '';
        channelEntry.liveUrl = channelsMap.get(manifestData[i].path).get('liveUrl')
          ? channelsMap.get(manifestData[i].path).get('liveUrl') : '';
      } else {
        channelEntry.externalId = manifestData[i].path;
        channelEntry.liveUrl = Utils.createUrl(host, manifestData[i].path);
        channelEntry.title = '';
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
