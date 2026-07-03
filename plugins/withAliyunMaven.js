const { withProjectBuildGradle } = require('@expo/config-plugins');

// Adds the Aliyun Maven repo for the expo-aliyun-push SDK and its transitive
// dependencies (com.aliyun.ams, com.taobao.android, etc.).
module.exports = function withAliyunMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;

    const snippet = `
        maven { url "https://maven.aliyun.com/nexus/content/repositories/releases/" }`;

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
