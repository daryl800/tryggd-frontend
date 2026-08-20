// plugins/withIosNotificationSound.js
//
// Bundles help_alert.caf (the custom sound for CALL ME NOW / ASKED TO SEND
// MONEY push notifications — see supabase/functions/send-help-request and
// lib/notifications/core.ts) into the iOS app target on every
// `npx expo prebuild`.
//
// Backstory (why this plugin exists at all): a help_alert.caf file has
// existed in this repo's git history since the very first version of Help
// Mode, force-added despite `ios/` being gitignored (see .gitignore's
// `/ios` rule). But it was ONLY ever the raw bytes sitting loose at
// ios/help_alert.caf — grepping ios/Tryggd.xcodeproj/project.pbxproj for
// "help_alert" turns up zero matches, meaning it was never added to the
// app target's "Copy Bundle Resources" build phase, on any branch, ever.
// A push payload's `sound: 'help_alert.caf'` field does nothing unless a
// file of that exact name is actually bundled inside the .app — without
// that, iOS silently falls back to the default system sound. And since
// project.pbxproj isn't tracked in git at all (it's inside the gitignored
// `ios/` folder), there was no durable place for that wiring to live even
// if someone had once done it by hand in Xcode — `expo prebuild --clean`
// wipes and regenerates the whole `ios/` folder, taking any manual Xcode
// edit with it.
//
// This plugin closes that gap the same way plugins/withAndroidWidget.js
// does for Android: keep the real source file in a path that survives
// prebuild (plugins/ios-notifications/help_alert.caf), then copy it into
// the generated ios/<Target>/ folder and register it in the Xcode project
// on every single prebuild, so it's never a one-off manual step again.
const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('fs-extra');
const path = require('path');

const SOUND_FILENAME = 'help_alert.caf';

/** Copies the sound file from its persistent source location into the
 * generated ios/<Target>/ source folder — the same folder AppDelegate.swift
 * and Info.plist live in, which is what actually ends up inside the app
 * bundle at build time once it's also registered as a resource below. */
function withIosNotificationSoundFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const srcPath = path.join(projectRoot, 'plugins', 'ios-notifications', SOUND_FILENAME);
      const destDir = IOSConfig.Paths.getSourceRoot(projectRoot);
      const destPath = path.join(destDir, SOUND_FILENAME);

      if (!(await fs.pathExists(srcPath))) {
        console.warn(`⚠️  withIosNotificationSound: source file missing at ${srcPath} — skipping.`);
        return config;
      }

      await fs.copy(srcPath, destPath, { overwrite: true });
      return config;
    },
  ]);
}

/** Registers help_alert.caf in the app target's "Copy Bundle Resources"
 * build phase, so it's actually packaged inside the .app and available to
 * iOS's notification sound lookup at runtime — a file sitting in the
 * source folder alone is NOT enough; Xcode only bundles what's listed in a
 * build phase.
 *
 * Mirrors expo-font's own withFontsIos.js (node_modules/expo-font/plugin) —
 * the built-in Expo plugin that bundles custom font files into the iOS
 * target on every prebuild, which is the exact same category of problem.
 * Calling `project.addResourceFile()` directly (the raw `xcode` package
 * API) throws if the project's main group doesn't already contain a
 * PBXGroup literally named "Resources" (confirmed against this project's
 * actual pbxproj, which doesn't have one) — `ensureGroupRecursively`
 * creates it first, then `addResourceFileToGroup` both creates the
 * PBXFileReference/PBXBuildFile entries AND links the file to the app
 * target (`com.apple.product-type.application`) by default.
 *
 * The PBXGroup created by ensureGroupRecursively has no `path` of its own,
 * so a bare filename here resolves relative to the PROJECT ROOT (ios/),
 * not the Tryggd/ source folder the file actually gets copied into above —
 * confirmed by an on-device build failure ("help_alert.caf couldn't be
 * opened because there is no such file", looking for it at ios/help_alert.caf
 * while it actually lived at ios/Tryggd/help_alert.caf). Passing the
 * filepath relative to platformProjectRoot (ios/), the same way
 * withFontsIos.js computes it via `path.relative(platformRoot, font)`,
 * fixes that mismatch. */
function withIosNotificationSoundXcodeEntry(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const destPath = path.join(IOSConfig.Paths.getSourceRoot(projectRoot), SOUND_FILENAME);
    const relativeFilepath = path.relative(platformProjectRoot, destPath);

    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: relativeFilepath,
      groupName: 'Resources',
      project,
      isBuildFile: true,
      verbose: true,
    });

    return config;
  });
}

module.exports = function withIosNotificationSound(config) {
  config = withIosNotificationSoundFile(config);
  config = withIosNotificationSoundXcodeEntry(config);
  return config;
};
