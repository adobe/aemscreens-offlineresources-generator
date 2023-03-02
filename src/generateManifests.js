import fetch from 'node-fetch';
import { outputFile } from 'fs-extra';
import GitUtils from './git-utils.js';
import CreateManifest from './createManifest.js';

export default class GenerateManifests {
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
    const parsedArgs = GenerateManifests.parseArgs(args);
    const helixManifest = parsedArgs.helixManifest ? `${parsedArgs.helixManifest}.json` : '/manifest.json';
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), { });
    const gitBranch = await GitUtils.getBranch(process.cwd());
    const url = `https://${gitBranch}--${gitUrl.repo}--${gitUrl.owner}.hlx.live`;
    const helixManifestPath = `${url}${helixManifest}`;
    const manifests = await GenerateManifests.fetchHelixManifest(helixManifestPath);
    await GenerateManifests.createManifests(url, manifests);
  }

  static async fetchHelixManifest(helixManifestPath) {
    let result = '';
    try {
      result = fetch(helixManifestPath)
        .then((response) => response.text());
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request failed with status code with error ${e}`);
    }
  }

  static async createManifests(url, jsonData) {
    const manifests = JSON.parse(jsonData);
    const totalManifests = parseInt(manifests.total, 10);
    const manifestData = manifests.data;
    for (let i = 0; i < totalManifests; i += 1) {
      /* eslint-disable no-await-in-loop */
      const manifest = await CreateManifest.createManifest(url, manifestData[i]);
      outputFile(`${manifestData[i].path.substring(1, manifestData[i].path.length)}.manifest.json`, manifest, (err) => {
        if (err) {
          /* eslint-disable no-console */
          console.log(err);
        }
      });
    }
  }
}
