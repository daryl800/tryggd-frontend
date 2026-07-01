const fs = require('fs');
const path = require('path');

// Read app.config.js as text and replace Aliyun env var references with a
// stable placeholder. These keys are build-time only (baked into the native
// SDK config) and must not influence the JS runtime fingerprint, because EAS
// injects the real values via secrets while local runs have empty env vars —
// causing a fingerprint mismatch that blocks OTA updates.
const appConfigSource = fs.readFileSync(
  path.join(__dirname, 'app.config.js'),
  'utf8'
);
const normalized = appConfigSource.replace(
  /process\.env\.ALIYUN_\w+/g,
  '"__ALIYUN_BUILD_TIME_ONLY__"'
);

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: 256, // ExpoConfigAll — replaced below with the normalized source
  extraSources: [
    {
      type: 'contents',
      id: 'expoConfig-normalized',
      contents: normalized,
      reasons: ['expoConfig'],
    },
  ],
};
