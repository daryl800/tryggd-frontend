// plugins/withAndroidNotificationSound.js
//
// Bundles help_alert.mp3 (the Android counterpart of ios-notifications'
// help_alert.caf — see lib/notifications/core.ts and
// supabase/functions/send-help-request) into android/app/src/main/res/raw/
// on every `npx expo prebuild`, so the help_alerts channel can point its
// `sound` at an actual bundled resource instead of the system default.
//
// Same source audio as iOS, re-encoded to mp3 — Android's raw resource
// sound lookup (expo-notifications' SoundResolver.java) needs a container
// format the platform's own MediaPlayer understands (mp3/ogg/wav/etc.);
// the iOS .caf container (and especially the AAC codec that was originally
// inside it — see git history / conversation around help_alert.caf) isn't
// one of those, so this can't just reuse that same file.
//
// Mirrors plugins/withAndroidWidget.js's dangerousMod-copy pattern. Kept as
// its own dedicated plugin (rather than using expo-notifications' built-in
// `sounds` config array) because that array is shared across BOTH
// platforms from one list — passing this mp3 through it would also copy it
// into the iOS bundle for no reason, and passing the iOS .caf through it
// would try to write an unusable `help_alert` raw resource on Android
// alongside this one, colliding on the same resource name. Keeping a
// dedicated per-platform plugin for each file avoids both problems.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs-extra');
const path = require('path');

const SOUND_FILENAME = 'help_alert.mp3';

function withAndroidNotificationSound(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = config.modRequest.platformProjectRoot;

      const srcPath = path.join(projectRoot, 'plugins', 'android-notifications', SOUND_FILENAME);
      const destDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'raw');
      const destPath = path.join(destDir, SOUND_FILENAME);

      if (!(await fs.pathExists(srcPath))) {
        console.warn(`⚠️  withAndroidNotificationSound: source file missing at ${srcPath} — skipping.`);
        return config;
      }

      await fs.ensureDir(destDir);
      await fs.copy(srcPath, destPath, { overwrite: true });
      return config;
    },
  ]);
}

module.exports = withAndroidNotificationSound;
