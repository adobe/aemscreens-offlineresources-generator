import fetch from 'node-fetch';

export default class CreateManifest {
  static async createManifest(url, data) {
    const channelPath = data.path;
    const scripts = data.scripts.substring(1, data.scripts.length - 1);
    const styles = data.styles.substring(1, data.styles.length - 1);
    const assets = data.assets.substring(1, data.assets.length - 1);
    const dependencies = data.dependencies.substring(1, data.dependencies.length - 1);
    const inlineImages = data['inline-images'].substring(1, data['inline-images'].length - 1);
    const scriptsList = CreateManifest.getScripts(scripts);
    const stylesList = CreateManifest.getStyles(styles);
    const assetsList = CreateManifest.getAssets(assets);
    const inlineImageList = CreateManifest.getInlineImages(inlineImages);
    const dependenciesList = CreateManifest.getDependencies(dependencies);
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

  static trimString(item, index, arr) {
    const item1 = item.trim();
    arr[index] = item1.substring(1, item1.length - 1);
  }

  static trimImagesPath(item, index, arr) {
    const item1 = item.trim();
    arr[index] = item1[0] === '.' ? item1.substring(1, item1.length) : item1;
  }

  static getScripts(scripts) {
    if (scripts === '') {
      return [];
    }
    const scriptsArr = scripts.split(',');
    scriptsArr.forEach(CreateManifest.trimString);

    return scriptsArr;
  }

  static getStyles(styles) {
    if (styles === '') {
      return [];
    }
    const stylesArr = styles.split(',');
    stylesArr.forEach(CreateManifest.trimString);

    return stylesArr;
  }

  static getAssets(assets) {
    if (assets === '') {
      return [];
    }
    const assetsArr = assets.split(',');
    assetsArr.forEach(CreateManifest.trimString);
    assetsArr.forEach(CreateManifest.trimImagesPath);

    return assetsArr;
  }

  static getInlineImages(inlineImages) {
    if (inlineImages === '') {
      return [];
    }
    const inlineImagesArr = inlineImages.split(',');
    inlineImagesArr.forEach(CreateManifest.trimString);
    inlineImagesArr.forEach(CreateManifest.trimImagesPath);

    return inlineImagesArr;
  }

  static getDependencies(dependencies) {
    if (dependencies === '') {
      return [];
    }
    const dependenciesArr = dependencies.split(',');
    dependenciesArr.forEach(CreateManifest.trimString);

    return dependenciesArr;
  }

  static isMedia(path) {
    return path.trim().startsWith('/media_');
  }

  static getHashFromMedia(path) {
    const path1 = path.trim();
    return path1.substring(7, path1.indexOf('.'));
  }

  static async getPageJsonEntry(url, path) {
    const pagePath = url + path;
    const resp = await fetch(pagePath, { method: 'HEAD' });
    const entry = {};
    entry.path = path;
    const date = resp.headers.get('last-modified');
    if (date !== null) {
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
    for (let i = 0; i < resourcesArr.length; i += 1) {
      const resourceSubPath = resourcesArr[i].trim();
      const resourcePath = `${url}${resourceSubPath}`;
      /* eslint-disable no-await-in-loop */
      const resp = await fetch(resourcePath, { method: 'HEAD' });
      const date = resp.headers.get('last-modified');
      if (!resp.ok) {
        /* eslint-disable no-console */
        console.log(`resource not available = ${resourcePath}`);
        /* eslint-disable no-continue */
        continue;
      }
      const resourceEntry = {};
      resourceEntry.path = resourcesArr[i];
      if (date !== null) {
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
