import fetch from 'node-fetch';

export default class FetchUtils {
    static fetchData = async (path) => {
        let result = '';
        try {
            result = fetch(path)
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
