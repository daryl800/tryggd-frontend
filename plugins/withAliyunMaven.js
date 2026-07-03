const { withProjectBuildGradle } = require('@expo/config-plugins');

// Adds the Aliyun Maven repo with content filtering so Gradle only looks there
// for com.aliyun.ams packages. Without filtering, Gradle tries this repo for
// every dependency and a 502 from Aliyun's server kills the entire build.
module.exports = function withAliyunMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;

    const snippet = `
        maven {
            url "https://maven.aliyun.com/nexus/content/repositories/releases/"
            content {
                includeGroup "com.aliyun.ams"
            }
        }`;

    if (contents.includes('maven.aliyun.com')) {
      return mod;
    }

    mod.modResults.contents = contents.replace(
      /allprojects\s*\{[^}]*repositories\s*\{/,
      (match) => match + snippet,
    );

    return mod;
  });
};
