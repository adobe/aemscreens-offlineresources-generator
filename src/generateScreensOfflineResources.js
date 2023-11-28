/* eslint-disable no-await-in-loop */
/* eslint-disable max-len */
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

import { outputFile, pathExists } from 'fs-extra';
import { load } from 'cheerio';
import GitUtils from './utils/gitUtils.js';
import ManifestGenerator from './createManifest.js';
import FetchUtils from './utils/fetchUtils.js';
import DefaultGenerator from './generator/default.js';
import PathUtils from './utils/pathUtils.js';

const logIfError = (err) => {
  if (err) {
    console.error(err);
  }
};

async function importAndRun(fileName, ...args) {
  let additionalAssets;
  try {
    const module = await import(`${fileName}`);
    if (typeof module.default.generateHTML === 'function') {
      additionalAssets = await module.default.generateHTML(...args);
    } else {
      console.log(`Function 'generateHTML' not found in module '${fileName}'. Fallback to default generator.`);
      additionalAssets = await DefaultGenerator.generateHTML(...args);
    }
  } catch (error) {
    console.error(`Error importing module ${fileName}: ${error}. Fallback to default generator.`);
    additionalAssets = DefaultGenerator.generateHTML(...args);
  }
  return additionalAssets;
}

export default class GenerateScreensOfflineResources {
  static getHost = async () => {
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), {});
    const gitBranch = await GitUtils.getBranch(process.cwd());
    return `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.hlx.live`;
  };

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
      channelData.liveUrl = GenerateScreensOfflineResources.processLiveUrl(channelsData[i].liveUrl);

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
    manifests,
    channelsList
  ) => {
    const totalManifests = parseInt(manifests.total, 10);
    const manifestData = manifests.data;
    const channelsData = channelsList.data;
    const channelsMap = GenerateScreensOfflineResources.createChannelMap(channelsData);
    const channelJson = {
      channels: [],
      metadata: {
        providerType: 'franklin'
      }
    };

    const manifestMap = manifestData.reduce((map, manifest) => {
      map.set(manifest.path, manifest);
      return map;
    }, new Map());

    const additionalAssetsMap = new Map();
    const isHtmlUpdatedMap = new Map();

    for (let i = 0; i < totalManifests; i++) {
      const data = manifestData[i];
      const relativeChannelPath = data.path.slice(1);

      // fetch franklin page -> get generator -> generate page
      // eslint-disable-next-line no-await-in-loop
      const resp = await FetchUtils.fetchDataWithMethod(host, data.path, 'GET');
      const franklinMarkup = await resp.text();
      const $ = load(franklinMarkup);
      const template = $('meta[name="template"]').attr('content');
      let additionalAssets;
      if (template && await pathExists(`./scripts/generators/${template}.js`)) {
        additionalAssets = await importAndRun(`${process.cwd()}/scripts/generators/${template}.js`, host, relativeChannelPath);
      } else {
        additionalAssets = await DefaultGenerator.generateHTML(host, relativeChannelPath);
      }

      let isHtmlUpdated = false;
      if (await GitUtils.isFileDirty(`${relativeChannelPath}.html`)) {
        console.log(`Git: Existing html at ${relativeChannelPath}.html is different from generated html.`);
        isHtmlUpdated = true;
      }
      additionalAssetsMap.set(data.path, additionalAssets);
      isHtmlUpdatedMap.set(data.path, isHtmlUpdated);
    }

    for (let i = 0; i < totalManifests; i++) {
      const data = manifestData[i];
      const [manifest, lastModified] = await ManifestGenerator.createManifest(host, manifestMap, data.path, isHtmlUpdatedMap, additionalAssetsMap.get(data.path));

      const channelEntry = {
        manifestPath: `${manifestData[i].path}.manifest.json`,
        lastModified: new Date(lastModified)
      };

      const hierarchy = PathUtils.getParentHierarchy(manifestData[i].path);
      channelEntry.hierarchy = hierarchy;
      if (channelsMap.get(manifestData[i].path)) {
        channelEntry.externalId = channelsMap.get(manifestData[i].path).externalId
          ? channelsMap.get(manifestData[i].path).externalId : '';
        channelEntry.title = channelsMap.get(manifestData[i].path).title
          ? channelsMap.get(manifestData[i].path).title : '';
        channelEntry.liveUrl = channelsMap.get(manifestData[i].path).liveUrl
          ? channelsMap.get(manifestData[i].path).liveUrl : '';
        if (channelsMap.get(manifestData[i].path).editUrl) {
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
      outputFile(manifestFilePath, JSON.stringify(manifest, null, 2), logIfError);
    }
    outputFile('screens/channels.json', JSON.stringify(channelJson, null, 2), logIfError);
  };

  static run = async (args) => {
    const parsedArgs = GenerateScreensOfflineResources.parseArgs(args);
    const helixManifest = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const helixChannelsList = parsedArgs.helixChannelsList
      ? `${parsedArgs.helixChannelsList}.json` : '/channels.json';

    const host = parsedArgs.customDomain || await GenerateScreensOfflineResources.getHost();
    let resp = await FetchUtils.fetchDataWithMethod(host, helixManifest, 'GET');
    const manifests = await resp.json();
    resp = await FetchUtils.fetchDataWithMethod(host, helixChannelsList, 'GET');
    const channelsList = await resp.json();
    await GenerateScreensOfflineResources.createOfflineResources(
      host,
      manifests,
      channelsList
    );
  };
}
