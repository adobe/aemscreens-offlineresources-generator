import { outputFile, ensureDir } from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '../utils/fetchUtils.js';

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    try {
      console.log(`Generating default HTML for ${host}/${path}`);
      const franklinString = await FetchUtils.fetchData(host, `/${path}`);
      const $ = load(franklinString);
      await ensureDir(p.dirname(path));
      await outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return [];
  };
}
