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

global.cache = global.cache || {};

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
    if (global.cache[url]) {
      return Promise.resolve(global.cache[url]);
    }
    let result = '';
    try {
      result = fetch(url, {
        headers: {
          ...additionalHeaders,
          'x-franklin-allowlist-key': process.env.franklinAllowlistKey
        }
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`request to fetch ${url} failed with status code ${response.status}`);
          }
          global.cache[url] = response.text();
          return global.cache[url];
        });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${url} failed with status code with error ${e}`);
    }
  };

  static makeHeadRequest = async (host, path, additionalHeaders = {}) => {
    const resourcePath = FetchUtils.createUrlFromHostAndPath(host, path);
    let resp;
    if (global.cache[resourcePath]) {
      resp = global.cache[resourcePath];
    } else {
      resp = await fetch(
        resourcePath,
        {
          method: 'HEAD',
          headers: {
            'x-franklin-allowlist-key': process.env.franklinAllowlistKey,
            ...additionalHeaders
          }
        }
      );
      global.cache[resourcePath] = resp;
    }
    return resp;
  };
}
