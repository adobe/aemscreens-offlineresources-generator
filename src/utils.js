import fetch from 'node-fetch';

export default class Utils {
  static createUrl(host, path) {
    const hostNew = host.endsWith('/') ? host.slice(0, -1) : host;
    const pathNew = path.startsWith('/') ? path.slice(1) : path;
    const url = `${hostNew}/${pathNew}`;
    return url;
  }

  static async fetchData(host, path) {
    const url = Utils.createUrl(host, path);
    let result = '';
    try {
      result = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`request to fetch ${path} failed with status code ${response.status}`);
          }
          return response.text();
        });
      return Promise.resolve(result);
    } catch (e) {
      throw new Error(`request to fetch ${path} failed with status code with error ${e}`);
    }
  }
}
