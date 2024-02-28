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

import FetchUtils from './utils/fetchUtils.js';
import PathUtils from './utils/pathUtils.js';
import GitUtils from './utils/gitUtils.js';

/**
 * Trims the image path and removes any query parameters from it.
 * Modifies the original array in place.
 *
 * @param {string} item - The image path to be trimmed and modified.
 * @param {number} index - The index of the current item in the array.
 * @param {Array.<string>} arr - The array containing the image paths.
 * @returns {void}
 */
const trimImagesPath = (item, index, arr) => {
  const trimmedItem = item.trim();
  const isRelative = trimmedItem[0] === '.';
  const noDot = isRelative ? trimmedItem.substring(1) : trimmedItem;
  // remove query param from image path if present
  const noQuery = noDot.split('?')[0];
  // Update the item in the original array
  arr[index] = noQuery;
};

export default class ManifestGenerator {
  constructor(host, indexedManifestsMap) {
    this.host = host;
    this.indexedManifestsMap = indexedManifestsMap;
  }

  /**
   * @param {string} path - resource path
   * @returns {Promise<string>} - last modified for resource
   * @throws {Error} - when resource does not exist
   *
   * media resources are not supported by admin APIs
   */
  getLastModified = async (path) => {
    // if file is modified in current run, use current timestamp
    if (await GitUtils.isFileDirty(path.slice(1))) {
      return new Date().getTime();
    }

    this.gitUrl = this.gitUrl || await GitUtils.getOriginURL(process.cwd(), {});
    this.branch = this.branch || await GitUtils.getBranch(process.cwd());
    const resp = await FetchUtils.fetchDataWithMethod(
      `https://admin.hlx.page/status/${this.gitUrl.owner}/${this.gitUrl.repo}/${this.branch}`,
      path,
      'GET'
    );
    const jsonResponse = await resp.json();
    if (jsonResponse.code?.status === 200) {
      // use sourceLastModified for code
      return new Date(jsonResponse.code.sourceLastModified).getTime();
    }
    if (jsonResponse.live?.status === 200) {
      return new Date(jsonResponse.live.lastModified).getTime();
    }
    // resource does not exist
    throw new Error(`Resource at ${path} does not exist`);
  };

  /**
   * Creating Page entry for manifest
   */
  getPageJsonEntry = async (channelPath) => {
    const path = `${channelPath}.html`;
    return {
      path,
      timestamp: await this.getLastModified(path)
    };
  };

  /**
   * Creates manifest entries for a given channel.
   *
   * @param {string} channelPath - The path of the channel.
   * @param {Set<string>} pageResources - Set of page resources.
   * @param {boolean} isHtmlUpdated - Indicates whether HTML is updated.
   * @returns {Promise<[Object[], number]>} - A promise resolving to
   *  an array containing the manifest entries JSON and the last modified timestamp.
   */
  createManifestEntriesForChannel = async (channelPath, pageResources) => {
    let resourcesArr = [];
    if (pageResources && pageResources.size > 0) {
      resourcesArr = Array.from(pageResources);
    }
    const entriesJson = [];
    const parentPath = PathUtils.getParentFromPath(channelPath);
    const pageEntryJson = await this.getPageJsonEntry(channelPath);
    let lastModified = pageEntryJson.timestamp;
    entriesJson.push(pageEntryJson);

    await Promise.all(resourcesArr.map(async (resourcePath) => {
      const resourceEntry = {};
      resourceEntry.path = resourcePath.trim();

      // Media resources have hash and do not need a timestamp to track changes
      if (PathUtils.isMedia(resourceEntry.path)) {
        resourceEntry.hash = PathUtils.getHashFromMedia(resourceEntry.path);
        resourceEntry.path = parentPath.concat(resourceEntry.path);
      } else {
        try {
          resourceEntry.timestamp = await this.getLastModified(resourceEntry.path);
          lastModified = Math.max(lastModified, resourceEntry.timestamp);
        } catch (e) {
          console.log(`resource ${resourceEntry.path} not available for channel ${channelPath}`);
          // skip this resource - do not add it as a manifest entry
          return;
        }
      }
      entriesJson.push(resourceEntry);
    }));

    return [entriesJson, lastModified];
  };

  /**
   *
   * @param {string} channelPath - The path of the channel
   * @param {[string]} additionalAssets - Additional resources added by generator
   * @returns Manifest for the channel
   */
  createManifestForChannel = async (channelPath, additionalAssets = []) => {
    // unwrap indexed manifest
    let {
      scripts = '[]', styles = '[]', assets = '[]',
      inlineImages = '[]', dependencies = '[]', fragments = '[]'
    } = this.indexedManifestsMap.get(channelPath);

    scripts = JSON.parse(scripts);
    styles = JSON.parse(styles);
    assets = JSON.parse(assets);
    inlineImages = JSON.parse(inlineImages);
    dependencies = JSON.parse(dependencies);
    fragments = JSON.parse(fragments);
    assets.forEach(trimImagesPath);
    inlineImages.forEach(trimImagesPath);

    const pageResources = new Set([...scripts,
      ...styles, ...assets,
      ...inlineImages, ...dependencies, ...additionalAssets]);

    const allEntries = new Map();
    let [entries, lastModified] = await this.createManifestEntriesForChannel(channelPath, pageResources);
    entries.forEach((entry) => allEntries.set(entry.path, entry));

    // add entries for all fragments
    await Promise.all(fragments.map(async (fragmentPath) => {
      const fragmentManifest = await this.createManifestForChannel(fragmentPath, [`${fragmentPath}.plain.html`]);

      lastModified = Math.max(lastModified, fragmentManifest.timestamp);
      fragmentManifest.entries.forEach((entry) => {
        // rebase media URLs to current path
        if (PathUtils.isMedia(entry.path)) {
          entry.path = PathUtils.extractMediaFromPath(entry.path);
          entry.path = PathUtils.getParentFromPath(channelPath).concat(entry.path);
        }
        allEntries.set(entry.path, entry);
      });
    }));

    // sort entries for consistent ordering
    entries = Array.from(allEntries.values()).sort((a, b) => a.path.localeCompare(b.path));

    return {
      version: '3.0',
      timestamp: lastModified,
      entries,
      contentDelivery: {
        providers: [{ name: 'franklin', endpoint: '/' }],
        defaultProvider: 'franklin'
      }
    };
  };
}
