// modules/tryggd-widget-bridge/ios/TryggdWidgetBridgeModule.swift
//
// Writes the widget snapshot JSON into the App Group's shared UserDefaults
// and asks WidgetKit to reload the widget's timeline. This runs in the
// MAIN APP process (it's a normal Expo module on the main target) — the
// widget extension (targets/widget, via @bacons/apple-targets) reads the
// same App Group UserDefaults from its own process. That's the whole
// bridge: no direct function call crosses the process boundary, shared
// storage is the handoff.
//
// IMPORTANT: `appGroupId` below MUST exactly match:
//   - the App Group entitlement on the MAIN app target (app.config.js,
//     ios.entitlements["com.apple.security.application-groups"])
//   - the App Group entitlement on the WIDGET extension target
//     (targets/widget/expo-target.config.js)
//   - the `appGroupId` constant read by the widget's TimelineProvider
//     (targets/widget/TryggdWidget.swift)
// See docs/home-screen-widget.md for the full checklist — this is the
// single most common source of "widget shows nothing" bugs with
// App-Group-based widgets, since a mismatch fails silently (UserDefaults
// just returns nil, there's no error).
import ExpoModulesCore
import WidgetKit

private let appGroupId = "group.com.marcustechnology.tryggd.widget"
private let snapshotKey = "widgetSnapshotJSON"

public class TryggdWidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TryggdWidgetBridge")

    Function("setSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: appGroupId) else {
        print("[TryggdWidgetBridge] Could not open App Group UserDefaults for \(appGroupId). " +
              "Check the App Group entitlement is present on both the app and widget targets.")
        return
      }
      defaults.set(json, forKey: snapshotKey)
      WidgetCenter.shared.reloadAllTimelines()
    }

    Function("clearSnapshot") {
      guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
      defaults.removeObject(forKey: snapshotKey)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
