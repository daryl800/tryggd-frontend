// modules/tryggd-widget-bridge/index.ts
//
// JS-facing surface of the widget bridge. Deliberately tiny: it takes an
// already-serialized JSON string (built by lib/widget/snapshot.ts +
// JSON.stringify) and writes it to platform shared storage, then asks the
// OS to refresh the widget(s). No parsing/shaping happens on the native
// side — that all lives in TS so the two platforms can't drift apart.
//
// This module has no UI of its own and needs no App Group entitlement
// itself beyond what's declared for the main app target (see
// app.config.js and docs/home-screen-widget.md) — it's a normal local
// Expo module, unlike the actual widget extension (ios/) which needs
// @bacons/apple-targets because it's a separate Xcode target.

import { requireNativeModule } from 'expo-modules-core';

type TryggdWidgetBridgeNativeModule = {
  /** Writes `json` to shared storage and requests a widget timeline/content reload. */
  setSnapshot(json: string): void;
  /** Clears shared storage (call on logout / account switch) and requests a reload. */
  clearSnapshot(): void;
};

// Lazily resolved so importing this module never throws in environments
// where the native module isn't present yet (e.g. before the first dev
// client rebuild after adding this module, or under `expo start` in Expo
// Go — see docs/home-screen-widget.md "Expo Go is not supported").
let nativeModule: TryggdWidgetBridgeNativeModule | null | undefined;

function getNativeModule(): TryggdWidgetBridgeNativeModule | null {
  if (nativeModule === undefined) {
    try {
      nativeModule = requireNativeModule<TryggdWidgetBridgeNativeModule>('TryggdWidgetBridge');
    } catch (error) {
      console.warn(
        '[tryggd-widget-bridge] Native module not available — widget snapshot will not be updated. ' +
          'This is expected in Expo Go or before a dev client rebuild that includes this module.',
        error
      );
      nativeModule = null;
    }
  }
  return nativeModule;
}

/** Writes the given (already-built) snapshot JSON to shared storage and
 * requests the OS refresh the Home Screen widget(s). Safe to call even if
 * the native module isn't available — becomes a no-op with a warning. */
export function setWidgetSnapshot(json: string): void {
  getNativeModule()?.setSnapshot(json);
}

/** Clears the shared snapshot and requests a refresh, so the widget falls
 * back to its logged-out state. Call on sign-out and when the active
 * account changes, before the new account's data (if any) is written. */
export function clearWidgetSnapshot(): void {
  getNativeModule()?.clearSnapshot();
}
