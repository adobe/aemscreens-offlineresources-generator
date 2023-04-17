import fetch from 'node-fetch';

export default class FetchUtils {
    static createUrlFromHostAndPath(host, path) {
        const hostNew = host.endsWith('/') ? host.slice(0, -1) : host;
        const pathNew = path.startsWith('/') ? path.slice(1) : path;
        return `${hostNew}/${pathNew}`;
    }

    static async fetchData(host, path) {
        const url = FetchUtils.createUrlFromHostAndPath(host, path);
        return await FetchUtils.fetchDataFromUrl(url);
    }

    static async fetchDataFromUrl(url) {
        let result = '';
        try {
            result = fetch(url)
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
    }
}
