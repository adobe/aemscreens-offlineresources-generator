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

import GitUtils from './gitUtils.js';
import FetchUtils from './fetchUtils.js';

export default class HelixAdminUtil {
  static helixAdminUrl = 'https://admin.hlx.page';

  static getLastModified = async (path) => {
    let lastModified = await HelixAdminUtil.getLastModifiedFromAdminAPIs(path, 'code');
    if (!lastModified && lastModified === '') {
      lastModified = await HelixAdminUtil.getLastModifiedFromAdminAPIs(path, 'live');
    }
    return lastModified;
  };

  static getLastModifiedFromAdminAPIs = async (path, api = 'code') => {
    const gitUrl = await GitUtils.getOriginURL(process.cwd(), {});
    const gitBranch = await GitUtils.getBranch(process.cwd());
    const codePath = `/${api}/${gitUrl.owner}/${gitUrl.repo}/${gitBranch}/${path}`;
    const resp = await FetchUtils.fetchDataWithMethod(HelixAdminUtil.helixAdminUrl, codePath, 'GET', {}, true);
    if (!resp.ok) {
      return '';
    }
    const jsonRes = JSON.parse(await resp.text());
    if (jsonRes[api] && jsonRes[api].status === 200 && jsonRes[api].lastModified) {
      return jsonRes[api].lastModified;
    }
    return '';
  };
}
