# screens-offlineresources-generator
Screens module to generate offline resources for Screens channels created through Franklin

## Installation
Install `screens-offlineresources-generator` as a global command. You need Node 12.11 or newer.
Use node version >= 14.
```bash
$ npm install -g @aem-screens/screens-offlineresources-generator
```

## Usage
To use the module, please follow the steps mentioned in [documentation](https://wiki.corp.adobe.com/display/screens/Support+of+offline+channel+for+Multiple+Content+Providers+in+AEM+Screens#SupportofofflinechannelforMultipleContentProvidersinAEMScreens-Steps)


## Development

### Build

```bash
npm install
```

### Lint

```bash
npm run lint
```
## Deployment

Login to your [npmjs](https://www.npmjs.com/) account through command line using the command
```bash
npm login
```
Once that is done, you need the access to `aem-screens` organization in npmjs to release which is private for now. For access please contact absarasw@adobe.com.
Once access is given, you can run the following command to publish. Please update the correct version in package.json before publish
```bash
npm publish --access public
```


## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
