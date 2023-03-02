#!/usr/bin/env node

import GenerateManifests from './generateManifests.js';

export default async function generateManifest() {
  await GenerateManifests.run(process.argv.slice(2));
}
