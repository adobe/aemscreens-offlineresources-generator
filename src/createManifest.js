/* eslint-disable no-await-in-loop */
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

import Constants from './constants.js';
import FetchUtils from './utils/fetchUtils.js';
import PathUtils from './utils/pathUtils.js';
import GitUtils from './utils/gitUtils.js';

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
  static isMedia = (path) => path.trim().includes(Constants.MEDIA_PREFIX);

  /**
   * For images hosted in Franklin, hash values are appended in name.
   */
  static getHashFromMedia = (path) => {
    const path1 = path.trim();
    return path1.substring(Constants.MEDIA_PREFIX.length, path1.indexOf('.'));
  };

  static extractMediaFromPath = (path) => path.trim().substring(path.indexOf(Constants.MEDIA_PREFIX));

  /**
   * Creating Page entry for manifest
   */
  static getPageJsonEntry = async (host, path, isHtmlUpdated) => {
    const entryPath = `${path}.html`;
    const resp = await FetchUtils.fetchData(host, path);
    const entry = { path: entryPath };
    // timestamp is optional value, only add if last-modified available
    if (isHtmlUpdated) {
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
  static createEntries = async (host, path, pageResources, isHtmlUpdated) => {
    let resourcesArr = [];
    if (pageResources && pageResources.size > 0) {
      resourcesArr = Array.from(pageResources);
    }
    const entriesJson = [];
    let lastModified = 0;
    const parentPath = PathUtils.getParentFromPath(path);
    const pageEntryJson = await ManifestGenerator.getPageJsonEntry(host, path, isHtmlUpdated);
    if (pageEntryJson.timestamp && pageEntryJson.timestamp > lastModified) {
      lastModified = pageEntryJson.timestamp;
    }
    entriesJson.push(pageEntryJson);
    for (let i = 0; i < resourcesArr.length; i++) {
      const resourceSubPath = resourcesArr[i].trim();
      const resp = await FetchUtils.makeHeadRequest(host, resourceSubPath);
      // validate if the resource is available locally
      if (!resp.ok && !(await GitUtils.isFileDirty(resourceSubPath.slice(1)))) {
        console.log(`resource ${resourceSubPath} not available for channel ${path}`);

        // eslint-disable-next-line no-continue
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
      entriesJson.push(resourceEntry);
    }

    return [entriesJson, lastModified];
  };

  static createManifest = async (host, manifestMap, path, isHtmlUpdated, additionalAssets = []) => {
    const data = manifestMap.get(path);
    /* eslint-disable object-curly-newline */
    const {
      scripts = '[]', styles = '[]', assets = '[]',
      inlineImages = '[]', dependencies = '[]', fragments = '[]'
    } = data;
    const scriptsList = JSON.parse(scripts);
    const stylesList = JSON.parse(styles);
    const assetsList = JSON.parse(assets);
    assetsList.forEach(ManifestGenerator.trimImagesPath);
    const inlineImagesList = JSON.parse(inlineImages);
    inlineImagesList.forEach(ManifestGenerator.trimImagesPath);
    const dependenciesList = JSON.parse(dependencies);
    const pageResources = new Set([...scriptsList,
      ...stylesList, ...assetsList,
      ...inlineImagesList, ...dependenciesList, ...additionalAssets]);

    const [entries, lastModified] = await ManifestGenerator
      .createEntries(host, data.path, pageResources, isHtmlUpdated);
    const allEntries = new Map();
    entries.forEach((entry) => {
      allEntries.set(entry.path, entry);
    });
    // add entries for all fragments
    const fragmentsList = JSON.parse(fragments);
    let fragmentsLastModified = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const fragmentPath of fragmentsList) {
      // eslint-disable-next-line no-unused-vars
      const [{ entries: newEntries }, fragmentLastModified] = await ManifestGenerator
        .createManifest(host, manifestMap, fragmentPath, false, [`${fragmentPath}.plain.html`]);

      fragmentsLastModified = Math.max(fragmentsLastModified, fragmentLastModified);
      newEntries.forEach((entry) => {
        // rebase media URLs to current path
        if (ManifestGenerator.isMedia(entry.path)) {
          entry.path = ManifestGenerator.extractMediaFromPath(entry.path);
          entry.path = PathUtils.getParentFromPath(path).concat(entry.path);
        }
        allEntries.set(entry.path, entry);
      });
    }

    // bug??
    // const currentTime = new Date().getTime();
    const manifestJson = {
      version: '3.0',
      timestamp: lastModified,
      entries: Array.from(allEntries.values()),
      contentDelivery: {
        providers: [{ name: 'franklin', endpoint: '/' }],
        defaultProvider: 'franklin'
      }
    };
    return [manifestJson, Math.max(lastModified, fragmentsLastModified)];
  };
}
