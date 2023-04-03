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
import Utils from './utils.js';

export default class CreateManifest {
  static async createManifest(host, data) {
    const scriptsList = JSON.parse(data.scripts);
    const stylesList = JSON.parse(data.styles);
    const assets = JSON.parse(data.assets);
    assets.forEach(CreateManifest.trimImagesPath);
    const assetsList = (assets && assets.length !== 0) ? assets : [];
    const inlineImages = JSON.parse(data.inlineImages);
    inlineImages.forEach(CreateManifest.trimImagesPath);
    const inlineImageList = (inlineImages && inlineImages.length !== 0) ? inlineImages : [];
    const dependencies = data.dependencies ? JSON.parse(data.dependencies) : '';
    const dependenciesList = (dependencies && dependencies.length !== 0) ? dependencies : [];

    const resources = new Set([...scriptsList,
      ...stylesList, ...assetsList,
      ...inlineImageList, ...dependenciesList]);
    const currentTime = new Date().getTime();
    const manifestJson = {};
    manifestJson.version = '3.0';
    manifestJson.contentDelivery = {};
    manifestJson.contentDelivery.providers = [{ name: 'franklin', endpoint: '/' }];
    manifestJson.contentDelivery.defaultProvider = 'franklin';
    manifestJson.timestamp = currentTime;
    const [entries, lastModified] = await CreateManifest.createEntries(host, data.path, resources);
    manifestJson.entries = entries;
    return [manifestJson, lastModified];
  }

  static trimImagesPath(item, index, arr) {
    const item1 = item.trim();
    arr[index] = item1[0] === '.' ? item1.substring(1, item1.length) : item1;
  }

  static isMedia(path) {
    return path.trim().startsWith(Constants.MEDIA_PREFIX);
  }

  static getHashFromMedia(path) {
    const path1 = path.trim();
    return path1.substring(Constants.MEDIA_PREFIX.length, path1.indexOf('.'));
  }

  static async getPageJsonEntry(host, path) {
    const pagePath = Utils.createUrl(host, path);
    const resp = await fetch(pagePath, { method: 'HEAD' });
    const entry = {};
    entry.path = path;
    const date = resp.headers.get('last-modified');
    if (date) {
      entry.timestamp = new Date(date).getTime();
    }
    return [entry, new Date(date).getTime()];
  }

  static async createEntries(host, path, resources) {
    const resourcesArr = Array.from(resources);
    const entriesJson = [];
    let lastModified = 0;
    const [pageEntryJson, pageLastModified] = await CreateManifest.getPageJsonEntry(host, path);
    if ((pageLastModified !== null) && (pageLastModified > lastModified)) {
      lastModified = pageLastModified;
    }
    entriesJson.push(pageEntryJson);
    for (let i = 0; i < resourcesArr.length; i++) {
      const resourceSubPath = resourcesArr[i].trim();
      const resourcePath = Utils.createUrl(host, resourceSubPath);
      /* eslint-disable no-await-in-loop */
      const resp = await fetch(resourcePath, { method: 'HEAD' });
      const date = resp.headers.get('last-modified');
      if (!resp.ok) {
        /* eslint-disable no-console */
        console.log(`resource ${resourcePath} not available for channel ${path}`);
        /* eslint-disable no-continue */
        continue;
      }
      const resourceEntry = {};
      resourceEntry.path = resourcesArr[i];
      if (date) {
        const timestamp = new Date(date).getTime();
        if (timestamp > lastModified) {
          lastModified = timestamp;
        }
        resourceEntry.timestamp = timestamp;
      } else if (CreateManifest.isMedia(resourceSubPath)) {
        resourceEntry.hash = CreateManifest.getHashFromMedia(resourceSubPath);
      }
      entriesJson.push(resourceEntry);
    }

    return [entriesJson, lastModified];
  }
}
