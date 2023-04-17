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

import { GitUrl } from '@adobe/helix-shared-git';

import git from 'isomorphic-git';
import fs from 'fs';

const cache = {};

export default class GitUtils {
  /**
   * Returns the `origin` remote url or `''` if none is defined.
   *
   * @param {string} dir working tree directory path of the git repo
   * @returns {Promise<string>} `origin` remote url
   */
  static getOrigin = async (dir) => {
    try {
      // const remotes = await git.listRemotes({ fs, dir });
      const rmt = (await git.listRemotes({ fs, dir })).find((entry) => entry.remote === 'origin');
      return typeof rmt === 'object' ? rmt.url : '';
    } catch (e) {
      // don't fail if directory is not a git repository
      /* eslint-disable no-console */
      console.log(`error while getting list remote ${e}`);
      return '';
    }
  };

  /**
   * Same as #getOrigin() but returns a `GitUrl` instance instead of a string.
   *
   * @param {string} dir working tree directory path of the git repo
   * @returns {Promise<GitUrl>} `origin` remote url ot {@code null} if not available
   * @param {GitUrl~JSON} defaults Defaults for creating the git url.
   */
  static getOriginURL = async (dir, defaults) => {
    const origin = await GitUtils.getOrigin(dir);
    return origin ? new GitUrl(origin, defaults) : null;
  };

  /**
   * Returns the name of the current branch. If `HEAD` is at a tag, the name of the tag
   * will be returned instead.
   *
   * @param {string} dir working tree directory path of the git repo
   * @returns {Promise<string>} current branch or tag
   */
  static getBranch = async (dir) => {
    // current branch name
    const currentBranch = await git.currentBranch({ fs, dir, fullname: false });
    // current commit sha
    const rev = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    // reverse-lookup tag from commit sha
    const allTags = await git.listTags({ fs, dir });

    // iterate sequentially over tags to avoid OOME
    /* eslint-disable no-restricted-syntax */
    for (const tag of allTags) {
      /* eslint-disable no-await-in-loop */
      const oid = await git.resolveRef({ fs, dir, ref: tag });
      const obj = await git.readObject({
        fs, dir, oid, cache
      });
      const commitSha = obj.type === 'tag'
        ? await git.resolveRef({ fs, dir, ref: obj.object.object }) // annotated tag
        : oid; // lightweight tag
      if (commitSha === rev) {
        return tag;
      }
    }
    // HEAD is not at a tag, return current branch
    return currentBranch;
  };

  /**
   * Determines whether the working tree directory contains uncommitted or unstaged changes.
   *
   * @param {string} dir working tree directory path of the git repo
   * @param {string} [homedir] optional users home directory
   * @returns {Promise<boolean>} `true` if there are uncommitted/unstaged changes; otherwise `false`
   */
  static isFileDirty = async (filePath, dir = './') => {
    // see https://isomorphic-git.org/docs/en/statusMatrix
    const HEAD = 1;
    const WORKDIR = 2;
    const STAGE = 3;
    const matrix = await git.statusMatrix({ fs, dir, cache });
    const modified = matrix
      .filter((row) => !(row[HEAD] === row[WORKDIR] && row[WORKDIR] === row[STAGE]));
    if (modified.length === 0) {
      return false;
    }
    const findFile = modified.find((row) => row[0] === filePath);
    return !!findFile;
  };
}
