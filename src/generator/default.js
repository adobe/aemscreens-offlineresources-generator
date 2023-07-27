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

import { outputFile, ensureDir } from 'fs-extra';
import p from 'path';
import { load } from 'cheerio';
import FetchUtils from '../utils/fetchUtils.js';

export default class HtmlGenerator {
  static generateHTML = async (host, path) => {
    try {
      console.log(`Generating default HTML for ${host}/${path}`);
      const franklinResponse = await FetchUtils.fetchDataWithMethod(host, path, 'GET');
      const franklinString = await franklinResponse.text();
      const $ = load(franklinString);
      await ensureDir(p.dirname(path));
      await outputFile(`${path}.html`, $.html());
    } catch (error) {
      console.error(error);
    }
    return [];
  };
}
