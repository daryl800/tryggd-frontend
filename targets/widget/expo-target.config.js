// targets/widget/expo-target.config.js
//
// @bacons/apple-targets config for the "My Circle" Home Screen widget.
// This directory is synced into the Xcode project on every
// `npx expo prebuild` — do not hand-edit the generated ios/ project for
// this target, edit this file and the .swift files in this directory
// instead. See docs/home-screen-widget.md.
//
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TryggdWidget',
  displayName: 'Tryggd — My Circle',
  // ".widget" is appended to the main app's bundle identifier, e.g.
  // com.marcustechnology.tryggd.widget — must stay in sync with the
  // WIDGET_BUNDLE_ID_SUFFIX comment in app.config.js.
  bundleIdentifier: '.widget',
  // 17.0, not 16.0: TryggdWidget.swift uses contentMarginsDisabled()
  // unconditionally (iOS 17+ only, needed to fix a real layout bug — see
  // docs/home-screen-widget.md §11), and keeping this at 17+ means the
  // widget's SwiftUI code never has to branch on #available at all. This
  // only affects who can install this specific extension — the main app's
  // own minimum iOS version (set elsewhere) is unchanged.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  // NOTE: on at least one real-device build, this `colors` config did not
  // actually produce an Assets.xcassets for the target at all (no
  // .xcassets directory appeared anywhere under targets/widget after
  // prebuild), which silently made every Color("name") reference in
  // TryggdWidget.swift resolve to nothing and rendered all widget text
  // invisible. Root cause not identified (possibly requires the
  // `npx create-target` CLI scaffold rather than a hand-authored config —
  // see the @bacons/apple-targets README). TryggdWidget.swift no longer
  // depends on this generating anything — all colors are hardcoded Swift
  // values there instead. Left here only for $accent/$widgetBackground,
  // which map to OS-level build settings that may have value independent
  // of whether the asset actually generates; remove if this still causes
  // confusion.
  colors: {
    $widgetBackground: { color: '#FBFBFA', darkColor: '#1C1C1E' },
    $accent: '#5FA893',
  },
  // Mirror the app's own App Group so the widget can read the snapshot
  // written by modules/tryggd-widget-bridge. Sourced from the main app's
  // entitlements (app.config.js) rather than hardcoded here, so there's
  // only one place this ID is defined for the whole iOS side.
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
