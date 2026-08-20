// plugins/withAndroidWidget.js
//
// Expo config plugin that adds Tryggd's action-based Jetpack Glance widget
// (Check In / Asked to Send Money) to the generated Android project on
// every `npx expo prebuild`. Unlike the iOS widget (a separate Xcode
// target via @bacons/apple-targets), an Android widget is just more files
// + manifest entries inside the SAME `app` module — no new Gradle module
// needed, which is why this can be a plain config plugin instead of a
// whole separate build target mechanism.
//
// What this does, each prebuild:
//   1. Copies the Kotlin widget source (plugins/android-widget/src/**)
//      into android/app/src/main/java/...
//   2. Copies the AppWidgetProviderInfo XML into android/app/src/main/res/xml/
//   3. Registers the <receiver> in AndroidManifest.xml
//   4. Merges the widget's own per-locale strings.xml files (see
//      plugins/android-widget/res/values*/strings.xml — one directory per
//      supported language, mirroring targets/widget/*.lproj/Localizable.strings
//      on iOS) into the matching android/app/src/main/res/values*/strings.xml,
//      creating each locale directory if it doesn't already exist.
//   5. Adds the Jetpack Glance Gradle dependency + enables Jetpack Compose
//      (Glance is built on Compose) in android/app/build.gradle, and adds
//      the Compose compiler Gradle plugin classpath in a local
//      buildscript {} block in that same file (see withAndroidWidgetGradle's
//      doc comment for why it has to live there and not in the root
//      android/build.gradle).
//
// Edit the SOURCE files under plugins/android-widget/ — never hand-edit
// the generated android/ output, it's overwritten on every prebuild. See
// docs/home-screen-widget.md.
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');

const WIDGET_PACKAGE = 'com.marcustechnology.tryggd.widget';
const WIDGET_RECEIVER_CLASS = 'TryggdWidgetReceiver';
const GLANCE_VERSION = '1.1.1';

// One entry per res/values*/strings.xml directory under
// plugins/android-widget/res/ — see docs/home-screen-widget.md
// "Localization". Norwegian ships under both the plain ISO 639-1 "no"
// qualifier and the BCP-47 "nb" (Bokmål) qualifier with identical content,
// since which one a real device resolves to isn't fully consistent across
// Android versions. Chinese uses the modern BCP-47 script qualifiers
// (b+zh+Hans / b+zh+Hant) rather than the legacy region-based zh-rCN/zh-rTW,
// which is the currently-recommended form — flagged here for on-device
// verification on any target running a very old Android version.
const ANDROID_WIDGET_LOCALE_DIRS = [
  'values',
  'values-da',
  'values-de',
  'values-es',
  'values-fi',
  'values-fr',
  'values-it',
  'values-ja',
  'values-ko',
  'values-nb',
  'values-no',
  'values-sv',
  'values-th',
  'values-b+zh+Hans',
  'values-b+zh+Hant',
];

/** Reads a strings.xml file (if it exists) into the same
 * `{ resources: { string: [{ $: { name }, _: value }, ...] } }` shape
 * @expo/config-plugins' own withStringsXml uses, so merge logic below can
 * treat "freshly read from disk" and "already-parsed mod result" the same
 * way. Returns an empty-but-valid shape if the file doesn't exist yet
 * (first prebuild, or a locale directory Android hasn't created on its
 * own). */
async function readStringsXml(filePath) {
  if (!(await fs.pathExists(filePath))) {
    return { resources: { string: [] } };
  }
  const contents = await fs.readFile(filePath, 'utf8');
  const parsed = await xml2js.parseStringPromise(contents);
  if (!parsed.resources) return { resources: { string: [] } };
  if (!parsed.resources.string) parsed.resources.string = [];
  return parsed;
}

function buildStringsXml(parsed) {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'utf-8' },
  });
  return builder.buildObject(parsed);
}

/** Merges plugins/android-widget/res/<localeDir>/strings.xml into
 * android/app/src/main/res/<localeDir>/strings.xml for every locale this
 * widget ships (ANDROID_WIDGET_LOCALE_DIRS). Entries are matched by
 * `name` — the widget's own tryggd_widget_* keys are added or replaced
 * with the latest source value, and any OTHER strings already present in
 * that locale's file (from Expo/RN or another config plugin) are left
 * untouched. Skips any source locale directory that doesn't have a
 * strings.xml (there is currently one for every entry in
 * ANDROID_WIDGET_LOCALE_DIRS, but this keeps the loop safe if that ever
 * changes). */
async function mergeAndroidWidgetLocaleStrings(projectRoot, androidRoot) {
  for (const localeDir of ANDROID_WIDGET_LOCALE_DIRS) {
    const srcPath = path.join(projectRoot, 'plugins', 'android-widget', 'res', localeDir, 'strings.xml');
    if (!(await fs.pathExists(srcPath))) continue;

    const srcParsed = await readStringsXml(srcPath);
    const srcStrings = srcParsed.resources.string || [];
    if (srcStrings.length === 0) continue;

    const destDir = path.join(androidRoot, 'app', 'src', 'main', 'res', localeDir);
    const destPath = path.join(destDir, 'strings.xml');
    await fs.ensureDir(destDir);

    const destParsed = await readStringsXml(destPath);
    const destStrings = destParsed.resources.string || [];

    for (const entry of srcStrings) {
      const name = entry.$?.name;
      if (!name) continue;
      const existingIndex = destStrings.findIndex((d) => d.$?.name === name);
      if (existingIndex === -1) {
        destStrings.push(entry);
      } else {
        destStrings[existingIndex] = entry;
      }
    }

    destParsed.resources = destParsed.resources || {};
    destParsed.resources.string = destStrings;
    await fs.writeFile(destPath, buildStringsXml(destParsed), 'utf8');
  }
}

/** Copies the Kotlin source tree and the widget-info XML into the
 * generated Android project, and merges this widget's localized strings
 * (see ANDROID_WIDGET_LOCALE_DIRS) into the matching per-locale strings.xml
 * files under res/. Runs as a "dangerous mod" because it touches the
 * filesystem directly rather than an AST/plist-style structured file. */
function withAndroidWidgetFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = config.modRequest.platformProjectRoot;

      const srcJavaDir = path.join(projectRoot, 'plugins', 'android-widget', 'src');
      const destJavaDir = path.join(androidRoot, 'app', 'src', 'main', 'java');
      fs.copySync(srcJavaDir, destJavaDir, { overwrite: true });

      const srcXmlFile = path.join(
        projectRoot,
        'plugins',
        'android-widget',
        'res',
        'xml',
        'tryggd_widget_info.xml'
      );
      const destXmlDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.ensureDirSync(destXmlDir);
      fs.copySync(srcXmlFile, path.join(destXmlDir, 'tryggd_widget_info.xml'), { overwrite: true });

      await mergeAndroidWidgetLocaleStrings(projectRoot, androidRoot);

      return config;
    },
  ]);
}

/** Registers the widget's GlanceAppWidgetReceiver in AndroidManifest.xml.
 * A Glance widget's receiver is a normal AppWidgetProvider under the
 * hood, so this is the standard <receiver> + intent-filter + meta-data
 * shape any Android widget needs. */
function withAndroidWidgetManifest(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    application.receiver = application.receiver || [];

    const alreadyRegistered = application.receiver.some(
      (r) => r.$?.['android:name'] === `${WIDGET_PACKAGE}.${WIDGET_RECEIVER_CLASS}`
    );
    if (alreadyRegistered) return config;

    application.receiver.push({
      $: {
        'android:name': `${WIDGET_PACKAGE}.${WIDGET_RECEIVER_CLASS}`,
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/tryggd_widget_info',
          },
        },
      ],
    });

    return config;
  });
}

/** Adds the Jetpack Glance dependency, enables Compose, and applies the
 * Compose compiler plugin in android/app/build.gradle. Glance is built on
 * Compose, so both are required even though the rest of the app is plain
 * React Native views. Kept to just the two Glance artifacts
 * TryggdWidget.kt actually uses — add glance-material3 etc. here too if
 * the widget's design grows to need it.
 *
 * The Compose compiler plugin's classpath is declared in a LOCAL
 * `buildscript {}` block right here in app/build.gradle, NOT in the root
 * android/build.gradle. This was tried at the root first (mirroring
 * expo-modules-core/android/build.gradle's own `${kotlinVersion}`
 * reference) and failed on a real build with "Could not get unknown
 * property 'kotlinVersion'" — Gradle evaluates the root project's own
 * `buildscript {}` block BEFORE any `apply plugin:` statement in that same
 * file runs, and it's one of those apply-plugin steps (expo-root-project /
 * com.facebook.react.rootproject) that actually defines `kotlinVersion` —
 * so the variable genuinely doesn't exist yet at that point for the root
 * project itself. expo-modules-core's own use of `${kotlinVersion}` only
 * works because it's a SUBPROJECT, and subprojects aren't evaluated until
 * the root project has fully finished (including its apply-plugin lines) —
 * by then the variable exists and is inherited via Gradle's project
 * hierarchy. app/ is a subproject too, so putting the classpath here
 * instead reproduces the same timing that makes expo-modules-core's
 * pattern actually work. */
function withAndroidWidgetGradle(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = 'androidx.glance:glance-appwidget';
    if (config.modResults.contents.includes(marker)) return config;

    let contents = config.modResults.contents;

    // Apply the Compose compiler plugin (its classpath is added via a
    // prepended buildscript {} block at the very end of this function —
    // done last deliberately, see the note below on why).
    if (!contents.includes("apply plugin: 'org.jetbrains.kotlin.plugin.compose'")) {
      contents = contents.replace(
        /apply plugin:\s*["']com\.facebook\.react["']/,
        (match) => `${match}\napply plugin: 'org.jetbrains.kotlin.plugin.compose'`
      );
    }

    // Enable Compose in the app module's android {} block.
    if (!contents.includes('buildFeatures')) {
      contents = contents.replace(
        /android\s*{/,
        `android {\n    buildFeatures {\n        compose true\n    }`
      );
    }

    // This targets the FIRST `dependencies {` in the file, which is why
    // the buildscript {} block below (which also contains a
    // `dependencies {}`) is prepended AFTER this runs, not before — doing
    // it first would make this regex match the buildscript's dependencies
    // block instead of the app module's own one.
    contents = contents.replace(
      /dependencies\s*{/,
      `dependencies {\n    implementation "androidx.glance:glance-appwidget:${GLANCE_VERSION}"\n    implementation "androidx.glance:glance:${GLANCE_VERSION}"`
    );

    // Local buildscript block for the Compose compiler plugin's classpath
    // — see the function doc comment above for why this can't live in the
    // root android/build.gradle. Prepended last, after the dependencies
    // regex above has already run against the file's real content.
    if (!contents.includes('org.jetbrains.kotlin.plugin.compose.gradle.plugin')) {
      // A subproject's own buildscript {} block does NOT inherit the root
      // project's buildscript repositories — found this the hard way on a
      // real build ("Cannot resolve external dependency ... because no
      // repositories are defined"). Needs its own repositories {}, same
      // as expo-modules-core/android/build.gradle's own buildscript block
      // has.
      contents =
        `buildscript {\n` +
        `  repositories {\n` +
        `    google()\n` +
        `    mavenCentral()\n` +
        `  }\n` +
        `  dependencies {\n` +
        `    classpath("org.jetbrains.kotlin.plugin.compose:org.jetbrains.kotlin.plugin.compose.gradle.plugin:\${kotlinVersion}")\n` +
        `  }\n` +
        `}\n\n` +
        contents;
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withAndroidWidget(config) {
  config = withAndroidWidgetFiles(config);
  config = withAndroidWidgetManifest(config);
  config = withAndroidWidgetGradle(config);
  return config;
};
