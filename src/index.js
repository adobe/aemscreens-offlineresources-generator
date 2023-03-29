#!/usr/bin/env node

import GenerateScreensOfflineConfig from './generateScreensOfflineConfig.js';

export default async function generateScreensOfflineConfig() {
  await GenerateScreensOfflineConfig.run(process.argv.slice(2));
}
