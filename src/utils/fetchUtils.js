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

import fetch from 'node-fetch-cache';

export default class FetchUtils {
  static createUrlFromHostAndPath = (host, path) => {
    const hostNew = host.endsWith('/') ? host.slice(0, -1) : host;
    const pathNew = path.startsWith('/') ? path.slice(1) : path;
    return `${hostNew}/${pathNew}`;
  };

  /**
   * Fetches data from the URL using the specified HTTP method.
   * The response object is cached for subsequent requests to the same URL.
   * @param {string} host - The host URL.
   * @param {string} path - The resource path to append to the host.
   * @param {string} method - The HTTP method to use for the request (e.g., 'GET', 'HEAD', etc.).
   * @param {Object} additionalHeaders - Additional headers to include in the request.
   * @returns {Promise<string|Response>} A promise that resolves to the response object.
   * @throws {Error} If the request fails or returns an error status code.
   */
  static fetchDataWithMethod = async (host, path, method, additionalHeaders = {}) => {
    const url = FetchUtils.createUrlFromHostAndPath(host, path);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'x-franklin-allowlist-key': process.env.franklinAllowlistKey,
          ...additionalHeaders
        }
      });

      if (!response.ok) {
        // not cache error responses
        await response.ejectFromCache();
        throw new Error(`Request to fetch ${url} failed with status code ${response.status}`);
      }

      return response;
    } catch (e) {
      throw new Error(`Request to fetch ${url} failed with error ${e}`);
    }
  };
}
