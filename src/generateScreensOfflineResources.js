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

const importAndRun = async (fileName, ...args) => {
  try {
    const module = await import(`${fileName}`);
    if (typeof module.default.generateHTML === 'function') {
      return await module.default.generateHTML(...args);
    }
    console.log(`Function 'generateHTML' not found in module '${fileName}'. Fallback to default generator.`);
    return await DefaultGenerator.generateHTML(...args);
  } catch (error) {
    console.error(`Error importing module ${fileName}: ${error}. Fallback to default generator.`);
    return DefaultGenerator.generateHTML(...args);
  }
};

const getHost = async () => {
  const gitUrl = await GitUtils.getOriginURL(process.cwd(), {});
  const gitBranch = await GitUtils.getBranch(process.cwd());
  return `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.aem.live`;
};

const parseArgs = (args) => {
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

const processLiveUrl = (liveUrl) => {
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

const createChannelMap = (channelsData) => channelsData.reduce((map, channel) => {
  const channelPath = channel.path;
  const channelData = {
    ...channel,
    liveUrl: processLiveUrl(channel.liveUrl)
  };
  map.set(channelPath, channelData);
  return map;
}, new Map());

const createManifestMap = (manifestData) => manifestData.reduce((map, manifest) => {
  map.set(manifest.path, manifest);
  return map;
}, new Map());

const runGeneratorAndGetAdditionalAssets = async (host, channelPath) => {
  const relativeChannelPath = channelPath.slice(1);
  // fetch franklin page -> get generator -> generate page
  const resp = await FetchUtils.fetchDataWithMethod(host, channelPath, 'GET');
  const franklinMarkup = await resp.text();
  const $ = load(franklinMarkup);
  const template = $('meta[name="template"]').attr('content');
  const templatePath = `${process.cwd()}/scripts/generators/${template}.js`;
  if (template && await pathExists(templatePath)) {
    return importAndRun(templatePath, host, relativeChannelPath);
  }

  return DefaultGenerator.generateHTML(host, relativeChannelPath);
};

export default class GenerateScreensOfflineResources {
  /**
   *
   * @param {string} host - host for the franklin site
   * @param {[Object]} indexedManifests - array of manifests indexed by franklin
   * @param {[Object]} indexedChannels - array of channels indexed by franklin
   */
  static createOfflineResources = async (host, indexedManifests, indexedChannels) => {
    const channelsMap = createChannelMap(indexedChannels);
    const manifestMap = createManifestMap(indexedManifests);

    const channelJson = {
      channels: [],
      metadata: {
        providerType: 'franklin'
      }
    };
    const additionalAssetsMap = new Map();

    let unfulfilledPromises = indexedManifests.map(async ({ path: channelPath }) => {
      const additionalAssets = await runGeneratorAndGetAdditionalAssets(host, channelPath);
      additionalAssetsMap.set(channelPath, additionalAssets);
    });
    await Promise.all(unfulfilledPromises);

    const manifestGenerator = new ManifestGenerator(host, manifestMap);

    unfulfilledPromises = indexedManifests.map(async ({ path: channelPath }) => {
      const additionalAssets = additionalAssetsMap.get(channelPath);
      const manifest = await manifestGenerator.createManifestForChannel(channelPath, additionalAssets);
      const manifestFilePath = `${channelPath.substring(1, channelPath.length)}.manifest.json`;
      outputFile(manifestFilePath, JSON.stringify(manifest, null, 2), logIfError);

      const channelJsonEntry = {
        manifestPath: `${channelPath}.manifest.json`,
        lastModified: new Date(manifest.timestamp),
        hierarchy: PathUtils.getParentHierarchy(channelPath)
      };

      if (channelsMap.get(channelPath)) {
        channelJsonEntry.externalId = channelsMap.get(channelPath).externalId || '';
        channelJsonEntry.title = channelsMap.get(channelPath).title || '';
        channelJsonEntry.liveUrl = channelsMap.get(channelPath).liveUrl || '';
        if (channelsMap.get(channelPath).editUrl) {
          channelJsonEntry.editUrl = channelsMap.get(channelPath).editUrl;
        }
        if (channelsMap.get(channelPath).isOnlineChannel === 'true') {
          console.log(`Online channel found: ${channelPath}. Removing manifest path.`);
          channelJsonEntry.manifestPath = null;
        }
      } else {
        channelJsonEntry.externalId = channelPath;
        channelJsonEntry.liveUrl = FetchUtils.createUrlFromHostAndPath(host, channelPath);
        channelJsonEntry.title = '';
      }
      channelJson.channels.push(channelJsonEntry);
    });
    await Promise.all(unfulfilledPromises);

    // sort entries for consistent ordering
    channelJson.channels.sort((a, b) => a.externalId.localeCompare(b.externalId));
    outputFile('screens/channels.json', JSON.stringify(channelJson, null, 2), logIfError);
  };

  /**
   * Main method exposed to clients
   */
  static run = async (args) => {
    const startTime = new Date();
    const parsedArgs = parseArgs(args);
    const indexedManifestPath = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const indexedChannelPath = parsedArgs.helixChannelsList ? `${parsedArgs.helixChannelsList}.json` : '/channels.json';
    const host = parsedArgs.customDomain || await getHost();

    let resp = await FetchUtils.fetchDataWithMethod(host, indexedManifestPath, 'GET');
    const indexedManifests = await resp.json();

    resp = await FetchUtils.fetchDataWithMethod(host, indexedChannelPath, 'GET');
    const indexedChannels = await resp.json();

    await GenerateScreensOfflineResources.createOfflineResources(host, indexedManifests.data, indexedChannels.data);
    console.log(`Offline Resource Generation took ${new Date() - startTime} ms`);
  };
}
