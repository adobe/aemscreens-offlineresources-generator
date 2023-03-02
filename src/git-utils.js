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
  static async getOrigin(dir) {
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
  }

  /**
   * Same as #getOrigin() but returns a `GitUrl` instance instead of a string.
   *
   * @param {string} dir working tree directory path of the git repo
   * @returns {Promise<GitUrl>} `origin` remote url ot {@code null} if not available
   * @param {GitUrl~JSON} defaults Defaults for creating the git url.
   */
  static async getOriginURL(dir, defaults) {
    const origin = await GitUtils.getOrigin(dir);
    return origin ? new GitUrl(origin, defaults) : null;
  }

  /**
   * Returns the name of the current branch. If `HEAD` is at a tag, the name of the tag
   * will be returned instead.
   *
   * @param {string} dir working tree directory path of the git repo
   * @returns {Promise<string>} current branch or tag
   */
  static async getBranch(dir) {
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
        fs, dir, oid, cache,
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
  }
}
