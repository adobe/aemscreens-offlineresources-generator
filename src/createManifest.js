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

import fetch from 'node-fetch';
import Constants from './constants.js';
import FetchUtils from './utils/fetchUtils.js';
import PathUtils from './utils/pathUtils.js';

export default class ManifestGenerator {
  /**
   * If the image path starts with a '.' then trim it to exclude it
   *
   */
  static trimImagesPath = (item, index, arr) => {
    const item1 = item.trim();
    arr[index] = item1[0] === '.' ? item1.substring(1, item1.length) : item1;
  };

  /**
   * Checks if the image is hosted in franklin
   */
  static isMedia = (path) => path.trim().startsWith(Constants.MEDIA_PREFIX);

  /**
   * For images hosted in Franklin, hash values are appended in name.
   */
  static getHashFromMedia = (path) => {
    const path1 = path.trim();
    return path1.substring(Constants.MEDIA_PREFIX.length, path1.indexOf('.'));
  };

  static getContentType = async (assetLink) => {
    const resp = await fetch(assetLink, { method: 'HEAD' });
    if (resp && resp.headers) {
      const contentType = resp.headers.get('content-type');
      return ManifestGenerator.processContentType(contentType);
    }
    return '';
  };

  static processContentType = (contentType) => {
    let type = '';
    if (contentType && contentType.includes('video')) {
      type = 'video';
    } else if (contentType && contentType.includes('image')) {
      type = 'image';
    }
    return type;
  };

  /**
   * Creating Page entry for manifest
   */
  static getPageJsonEntry = async (host, path, updateHtml) => {
    const entryPath = `${path}.html`;
    const pagePath = FetchUtils.createUrlFromHostAndPath(host, entryPath);
    const resp = await fetch(
      pagePath,
      { method: 'HEAD', headers: { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey } }
    );
    const entry = {};
    entry.path = entryPath;
    // timestamp is optional value, only add if last-modified available
    if (updateHtml) {
      entry.timestamp = new Date().getTime();
    } else if (resp.ok && resp.headers.get('last-modified')) {
      const date = resp.headers.get('last-modified');
      entry.timestamp = new Date(date).getTime();
    }
    return entry;
  };

  /**
   * Create the manifest entries
   */
  static createEntries = async (host, path, pageResources, updateHtml, useAdaptiveRenditions) => {
    let resourcesArr = [];
    if (pageResources && pageResources.size > 0) {
      resourcesArr = Array.from(pageResources);
    }
    const entriesJson = [];
    let lastModified = 0;
    const parentPath = PathUtils.getParentFromPath(path);
    const pageEntryJson = await ManifestGenerator
      .getPageJsonEntry(host, path, updateHtml);
    if (pageEntryJson.timestamp && pageEntryJson.timestamp > lastModified) {
      lastModified = pageEntryJson.timestamp;
    }
    entriesJson.push(pageEntryJson);
    for (let i = 0; i < resourcesArr.length; i++) {
      const resourceSubPath = resourcesArr[i].trim();
      const resourcePath = FetchUtils.createUrlFromHostAndPath(host, resourceSubPath);
      /* eslint-disable no-await-in-loop */
      const resp = await fetch(
        resourcePath,
        { method: 'HEAD', headers: { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey } }
      );
      if (!resp.ok) {
        /* eslint-disable no-console */
        console.log(`resource ${resourcePath} not available for channel ${path}`);
        /* eslint-disable no-continue */
        continue;
      }
      const resourceEntry = {};
      resourceEntry.path = resourcesArr[i];
      // timestamp is optional value, only add if last-modified available
      const date = resp.headers.get('last-modified');
      if (date) {
        const timestamp = new Date(date).getTime();
        if (timestamp > lastModified) {
          lastModified = timestamp;
        }
        resourceEntry.timestamp = timestamp;
      } else if (ManifestGenerator.isMedia(resourceSubPath)) {
        resourceEntry.path = parentPath.concat(resourceEntry.path);
        resourceEntry.hash = ManifestGenerator.getHashFromMedia(resourceSubPath);
      }

      if(useAdaptiveRenditions && await ManifestGenerator.getContentType(resourcePath) === 'image') {
        resourceEntry.renditions = [];
        const assetName = PathUtils.getAssetName(resourcePath);
        const renditionsParentPath = PathUtils.getParentFromPath(resourceSubPath) + '/' + assetName + '_renditions/';
        const landscapeRendition = renditionsParentPath + assetName + '-landscape.jpeg';
        const portraitRendition = renditionsParentPath + assetName + '-portrait.jpeg';
        const response1 = await fetch(
            FetchUtils.createUrlFromHostAndPath(host,landscapeRendition),
            { method: 'HEAD', headers: { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey } }
        );
        if (response1.ok) {
          const landscapeRenditionJson = {};
          landscapeRenditionJson.height = 1024;
          landscapeRenditionJson.width = 1408;
          landscapeRenditionJson.path = landscapeRendition;
          landscapeRenditionJson.name = 'landscape';
          resourceEntry.renditions.push(landscapeRenditionJson);
        }

        const response2 = await fetch(
            FetchUtils.createUrlFromHostAndPath(host,portraitRendition),
            { method: 'HEAD', headers: { 'x-franklin-allowlist-key': process.env.franklinAllowlistKey } }
        );
        if (response2.ok) {
          const portraitRenditionJson = {};
          portraitRenditionJson.height = 1408;
          portraitRenditionJson.width = 1024;
          portraitRenditionJson.path = portraitRendition;
          portraitRenditionJson.name = 'portrait';
          resourceEntry.renditions.push(portraitRenditionJson);
        }
      }

      entriesJson.push(resourceEntry);
    }

    return [entriesJson, lastModified];
  };

  static createManifest = async (host, data, generateLoopingHtml, updateHtml, sequenceAssets = [], useAdaptiveRenditions) => {
    let pageResources;
    if (generateLoopingHtml === true) {
      pageResources = new Set(sequenceAssets);
    } else {
      /* eslint-disable object-curly-newline */
      const {
        scripts = '[]', styles = '[]', assets = '[]',
        inlineImages = '[]', dependencies = '[]', background = ''
      } = data;
      const scriptsList = JSON.parse(scripts);
      const stylesList = JSON.parse(styles);
      const assetsList = JSON.parse(assets);
      if(background !== '') {
        assetsList.push(background);
      }
      assetsList.forEach(ManifestGenerator.trimImagesPath);
      const inlineImagesList = JSON.parse(inlineImages);
      inlineImagesList.forEach(ManifestGenerator.trimImagesPath);
      const dependenciesList = JSON.parse(dependencies);
      pageResources = new Set([...scriptsList,
        ...stylesList, ...assetsList,
        ...inlineImagesList, ...dependenciesList]);
    }
    const [entries, lastModified] = await ManifestGenerator
      .createEntries(host, data.path, pageResources, updateHtml, useAdaptiveRenditions);
    const currentTime = new Date().getTime();
    const manifestJson = {};
    manifestJson.version = '3.0';
    manifestJson.contentDelivery = {};
    manifestJson.contentDelivery.providers = [{ name: 'franklin', endpoint: '/' }];
    manifestJson.contentDelivery.defaultProvider = 'franklin';
    manifestJson.timestamp = currentTime;
    manifestJson.entries = entries;
    return [manifestJson, lastModified];
  };
}
