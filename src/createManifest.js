import fetch from 'node-fetch';
import Constants from './constants.js';

export default class CreateManifest {
  static async createManifest(url, data) {
    const channelPath = data.path;
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
    const [entries, lastModified] = await CreateManifest.createEntries(url, channelPath, resources);
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

  static async getPageJsonEntry(url, path) {
    const pagePath = url + path;
    const resp = await fetch(pagePath, { method: 'HEAD' });
    const entry = {};
    entry.path = path;
    const date = resp.headers.get('last-modified');
    if (date) {
      entry.timestamp = new Date(date).getTime();
    }
    return [entry, new Date(date).getTime()];
  }

  static async createEntries(url, path, resources) {
    const resourcesArr = Array.from(resources);
    const entriesJson = [];
    let lastModified = 0;
    const [pageEntryJson, pageLastModified] = await CreateManifest.getPageJsonEntry(url, path);
    if ((pageLastModified !== null) && (pageLastModified > lastModified)) {
      lastModified = pageLastModified;
    }
    entriesJson.push(pageEntryJson);
    for (let i = 0; i < resourcesArr.length; i++) {
      const resourceSubPath = resourcesArr[i].trim();
      const resourcePath = `${url}${resourceSubPath}`;
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
