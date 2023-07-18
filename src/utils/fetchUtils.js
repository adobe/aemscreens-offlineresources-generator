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

export default class FetchUtils {
  static createUrlFromHostAndPath = (host, path) => {
    const hostNew = host.endsWith('/') ? host.slice(0, -1) : host;
    const pathNew = path.startsWith('/') ? path.slice(1) : path;
    return `${hostNew}/${pathNew}`;
  };

  static fetchData = async (host, path, additionalHeaders = {}) => {
    const url = FetchUtils.createUrlFromHostAndPath(host, path);
    return FetchUtils.fetchDataFromUrl(url, additionalHeaders);
  };

  static fetchDataFromUrl = async (url, additionalHeaders = {}) => {
    let result = '';
    try {
      result = fetch(url, { headers: { ...additionalHeaders } })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`request to fetch ${url} failed with status code ${response.status}`);
          }
          return response.text();
        });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${url} failed with status code with error ${e}`);
    }
  };
}
