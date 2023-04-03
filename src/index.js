#!/usr/bin/env node

import GenerateScreensOfflineResources from './generateScreensOfflineResources.js';

export default async function generateScreensOfflineResources() {
  await GenerateScreensOfflineResources.run(process.argv.slice(2));
}
