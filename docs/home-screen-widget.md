# Home Screen / Lock Screen Widgets — V2 ("Action Surface")

iOS + Android widgets whose job is to take an action, not display a status feed:

- **Check In** — "I'm okay," in one tap.
- **Asked to Send Money** — opens Tryggd's anti-fraud alert screen (does not send the alert itself — see §3).

Built on branch `feature/home-screen-widget`. This doc is the reference for everything about the feature: architecture, what's implemented, required Apple/Google configuration, and the testing checklist. Read it before your first build attempt — several steps below are things nobody but you (the person with an Apple Developer account, Xcode, and an Android SDK) can do.

## 0. Why V2 replaced V1 ("My Circle")

The original version of this widget showed the check-in status of the user's trusted contacts — names, timestamps, an "overdue" flag. It worked, but it had a structural problem that showed up in real usage: **a widget can only refresh while the app is actually open.** Neither push notifications nor Supabase Realtime deliver updates to a backgrounded/closed app in a way a widget can observe, so "My Circle" was, at best, a snapshot from the last time you happened to open Tryggd — sometimes hours old. A stale "hasn't checked in in 2 days" for someone who'd actually just checked in caused exactly the kind of confusion and worry this app exists to prevent, and it duplicated information the push notification for the same event had already delivered, live, the moment it happened.

The fix isn't a better staleness indicator — it's showing something that's *never* stale. The one thing a widget can always know accurately, with zero staleness risk, is **whether this device's own user has completed today's check-in** — because that check-in is always initiated from this same device, at the exact moment the widget's snapshot is written. So V2 drops all trusted-circle/contact data from the widget entirely and replaces it with two things that are always reliable: the user's own completion state, and two shortcuts into flows that already exist in the app.

If you're picking up related work later and wondering why there's no `WidgetContact`, `needsAttention`, or `latestActivity` anywhere anymore — this is why. That code (and the real bugs found fixing it, including a fun "widget and Activity screen disagreed about the same contact" bug) is gone, not lost; if you need the history, it's in this file's git log prior to the V2 rewrite.

## 1. Architecture summary

```
app/(tabs)/index.tsx — the SAME check-in flow that already exists
  → on a successful check-in, on discovering a check-in from another
    device (fetchLastCheckin), and on a local-day reset, calls
    buildWidgetOwnState() (lib/widget/snapshot.ts)
  → setWidgetSnapshot() (tryggd-widget-bridge)
  → tryggd-widget-bridge (modules/tryggd-widget-bridge) — local Expo native module,
    UNCHANGED from V1 (it just moves an opaque JSON blob, shape-agnostic)
      iOS:     writes JSON into App Group shared UserDefaults, calls
               WidgetCenter.reloadAllTimelines()
      Android: writes JSON into SharedPreferences, broadcasts an
               AppWidgetManager update to the widget's receiver
  → native widget reads the shared snapshot, re-derives "checked in today"
    against the CURRENT local calendar day (never trusts the stored
    boolean blindly — see §5), and renders using its own native
    localization tables (§6)
      iOS:     targets/widget (WidgetKit/SwiftUI, via @bacons/apple-targets)
               — THREE widgets in one bundle: Home Screen action widget +
               two separate Lock Screen shortcuts
      Android: plugins/android-widget (Jetpack Glance, via a config plugin)
               — one Home Screen action widget (no Lock Screen equivalent
               exists on Android)
```

The widget never talks to Supabase directly — it only ever reads what `app/(tabs)/index.tsx` already wrote to shared storage. **`contexts/ContactCheckinsContext.tsx` has zero involvement in the widget in V2** — in V1 it was the thing that pushed the snapshot (it had all the trusted-circle data the widget needed); in V2 the widget only needs the user's *own* check-in state, which `index.tsx` already tracks locally for its own UI, so the push happens right there instead. `ContactCheckinsContext.tsx` is back to being purely about serving Home/Activity with contact data, same as before this feature ever existed.

**Why the two platforms look structurally different:** an iOS widget is a separate process (a WidgetKit *extension*, its own Xcode target) — the only way to hand it data is through something both processes can see, which is why there's an App Group and UserDefaults. An Android widget runs *inside* the app's own process — it's "just" an `AppWidgetProvider`/`GlanceAppWidgetReceiver` living in the same `app` Gradle module, so it can read a plain `SharedPreferences` file directly. No App-Group-equivalent exists or is needed on Android.

**Why this needed a plan before code:** `ios/` and `android/` are gitignored in this project (`.gitignore` → `/ios`, `/android`) — they're regenerated by `expo prebuild` (Continuous Native Generation). Anything added directly inside those folders would be silently deleted on the next prebuild (which EAS Build always runs). Every native addition here is therefore expressed as source-under-version-control (`targets/widget/`, `plugins/android-widget/`, `modules/tryggd-widget-bridge/`) plus config plugins that copy/wire it into the generated project on every prebuild.

## 2. Files added / changed (V2)

**Shared (TypeScript, no native code):**
- `lib/widget/types.ts` — `WidgetOwnState` (`updatedAt`, `isLoggedIn`, `checkedInToday`, `lastCheckinUtc`) and `EMPTY_WIDGET_OWN_STATE`. Deliberately carries **no** trusted-circle data and **no** resolved UI text (see §6 for why).
- `lib/widget/snapshot.ts` — `buildWidgetOwnState(isLoggedIn, checkedInToday, lastCheckinUtc)`, a small pure function.

**Bridge (local Expo native module — unchanged from V1):**
- `modules/tryggd-widget-bridge/` — `index.ts` (JS API: `setWidgetSnapshot`, `clearWidgetSnapshot`), `ios/TryggdWidgetBridgeModule.swift`, `android/.../TryggdWidgetBridgeModule.kt`. This module just moves an opaque JSON string and asks the OS to refresh the widget — it required **zero changes** for the V1→V2 rewrite, because it never knew or cared what shape the JSON was.

**iOS widget (Xcode target, generated by `@bacons/apple-targets`):**
- `targets/widget/expo-target.config.js` — target config (type, colors, entitlements, `deploymentTarget: '17.0'`).
- `targets/widget/TryggdWidget.swift` — fully rewritten. Contains the own-state DTO/decoding, a `TimelineProvider` that schedules a second entry at the next local midnight (§5), the Home Screen action view (`TryggdActionWidgetView`), the two Lock Screen shortcut views, and three `Widget` struct declarations (`TryggdWidget`, `TryggdCheckInShortcut`, `TryggdMoneyHelpShortcut`) registered together in one `WidgetBundle`.
- `targets/widget/<lang>.lproj/Localizable.strings` — **new in V2**, one per supported language (§6).

**Android widget (config-plugin-injected into the existing `app` module):**
- `plugins/android-widget/src/com/marcustechnology/tryggd/widget/TryggdWidget.kt` — fully rewritten: own-state parsing, the two-button action layout, no more contact rows/stale-state/needs-attention logic.
- `plugins/android-widget/res/xml/tryggd_widget_info.xml` — `AppWidgetProviderInfo`; min size bumped from the old compact list-row footprint to comfortably fit a title row + two full-width buttons.
- `plugins/android-widget/res/values*/strings.xml` — **new in V2**, one directory per supported language (§6).
- `plugins/withAndroidWidget.js` — copies the above into `android/`, registers the receiver in `AndroidManifest.xml`, merges the per-locale `strings.xml` files (§6), adds the Glance dependency + enables Jetpack Compose in `android/app/build.gradle`.

**Wiring into the existing app:**
- `app/(tabs)/index.tsx` — the only file with new *logic* in this feature. A module-level `pushWidgetOwnState()` helper is called from the three places this screen already tracks the user's own check-in state: `handleCheckIn`'s success handler (never on failure), both branches of `fetchLastCheckin` (this is also how "checked in from another device" reaches the widget — see §5), and `resetAllState`. A small `useEffect` watches `useLocalSearchParams()` for `?mode=help` and calls the existing `handleCheckinModeChange('reach_out')` — this is the entire "Asked to Send Money" deep link, reusing the Help screen's existing local component state rather than adding a new route (see §3 for a caveat this uncovered).
- `contexts/ContactCheckinsContext.tsx` — **stripped**, not extended: all widget-push code removed (see §1).
- `contexts/AuthContext.tsx` — unchanged *logic* (still clears the snapshot on `SIGNED_OUT` or a detected account switch); comments updated to describe `WidgetOwnState` instead of the old trusted-circle snapshot.
- `app.config.js` — unchanged from V1 (App Group, `@bacons/apple-targets`, `withAndroidWidget` plugin registration).
- `package.json` — added `xml2js` (used by `withAndroidWidget.js` to merge per-locale `strings.xml` files without clobbering other resources already in those files).

## 3. Deep linking — and a tier-gating side effect worth knowing about

Both actions deep-link into **existing** screens/flows; neither duplicates check-in or anti-fraud-alert logic natively:

| Action | URI | Resolves to |
|---|---|---|
| Check In | `tryggd://?mode=home` | `app/(tabs)/index.tsx`, with `?mode=home` triggering `handleCheckinModeChange('home')` — forces the Daily tab, since `checkinMode` is persisted (AsyncStorage/Supabase) and would otherwise resume whatever tab was last active |
| Asked to Send Money | `tryggd://?mode=help` | Same route, with `?mode=help` triggering the existing `handleCheckinModeChange('reach_out')` — switches the screen into its existing Help mode |

Both URIs are identical on iOS and Android (`checkInURL`/`moneyHelpURL` in `TryggdWidget.swift`, `CHECK_IN_URI`/`MONEY_HELP_URI` in `TryggdWidget.kt`) — same route, same query param, same handling, on purpose.

**"Asked to Send Money" only opens the Help screen — it never sends the alert itself.** A Home Screen widget is easy to touch by accident (loose pocket, stray tap), so notifying someone's entire trusted circle can never be a single accidental tap away. The user must still deliberately tap the real "I need help"/money-help button inside the app after the widget opens it. Don't "helpfully" wire the widget straight to the send action later without re-reading this paragraph.

**Discovered side effect, not yet resolved — flagging for a decision:** in the app today, the Help/`reach_out` mode is normally only reachable through UI that's gated behind `canUseEnhancedHome` (a Plus-tier check) — but `HelpModeScreen`'s own render condition (`isReachOutMode && user`) does **not** itself check that flag. That means the widget's `?mode=help` deep link successfully opens Help mode for every user, including free-tier accounts who can't normally reach that UI from inside the app. This is a genuine, if narrow, behavior change (it extends free-tier reach to a screen that's otherwise Plus-gated) discovered while wiring the deep link, not something intentionally designed. Options if this isn't wanted: gate the `useEffect` in `index.tsx` that consumes `?mode=help` behind the same `canUseEnhancedHome` check (and decide what a free-tier user should see instead — probably just land on Home normally), or decide the anti-fraud flow is important enough to be free-tier-accessible regardless of source and leave it as-is. Not changed here since it's a product decision, not a bug — see the testing checklist (§9) for a line item to confirm which behavior is wanted before shipping.

## 4. Daily reset — "Checked In Today" flipping back to "Check In"

The widget needs to look like today's Check In button again once a new local day starts, even if the app is never reopened overnight. The two platforms solve this differently, because they have different capabilities:

**iOS:** `OwnStateTimelineProvider.getTimeline()` returns not just the current entry but, if the user is currently checked in, a *second* `TimelineEntry` scheduled for exactly the next local midnight (`Calendar.current.nextDate(after:matching:...)`), showing the reset state. WidgetKit itself renders that second entry once its date arrives — no trigger needed, the widget flips back to "Check In" on its own overnight. Both entries additionally re-derive the checked-in state from `lastCheckinUtc` against `Calendar.current.isDateInToday(_:)` (`isCheckedInNow()`), so even a render that happens for some other reason self-corrects rather than blindly trusting the stored `checkedInToday` boolean — this also makes time zone changes (the user travels) resolve correctly, since `Calendar.current` always reflects the device's current zone.

**Android:** Jetpack Glance has no equivalent "render at a future time" primitive, and `tryggd_widget_info.xml` deliberately disables `updatePeriodMillis` polling in favor of app-driven refreshes. So on Android, the same `isCheckedInNow()` re-derivation (in `TryggdWidget.kt`) is the *only* reset mechanism, and it only takes effect the next time `provideGlance()` actually runs — a widget tap, an app open that pushes a fresh snapshot, or one of Android's own occasional widget refresh passes. In the rare case none of those happen between local midnight and the next interaction, the Android widget may cosmetically keep showing "Checked In Today" for a while into the new day; the moment anything re-renders it, it self-corrects. **This never affects the actual check-in state** — that's tracked by `index.tsx`'s own audited `checkDateAndReset`/`isSameDay` logic regardless of what the widget happens to be displaying. Documented here rather than "fixed" because closing this gap would mean adding a new background-scheduling dependency (e.g. WorkManager) to a widget whose whole design goal was minimal footprint reusing existing infrastructure — revisit only if real usage shows the cosmetic lag actually matters.

## 5. Data flow detail — "checked in from another device"

The widget doesn't just reflect check-ins made by tapping the widget itself. `app/(tabs)/index.tsx`'s `fetchLastCheckin` — which already runs on every normal app open/sync to populate the Home screen's own UI — pushes a fresh `WidgetOwnState` in both of its branches (found a remote check-in for today / did not). So opening the app on Device B after checking in from Device A syncs the widget on Device B correctly, the same way the in-app UI already does — no separate polling or subscription was added for this, it rides along with a sync path that already existed.

The widget itself **never** independently polls Supabase — it only ever reads the last snapshot `index.tsx` wrote. If the user hasn't opened the app since checking in on another device, the widget won't know yet; that's expected, matches the "only ever as fresh as the last app open" constraint the whole V1→V2 rewrite was designed around, and is unrelated to the daily-reset behavior in §4.

## 6. Localization

**Design decision (confirmed explicitly, don't relitigate without a reason):** the shared JSON snapshot (`WidgetOwnState`) is language-neutral — it carries structured state (`isLoggedIn`, `checkedInToday`, `lastCheckinUtc`, `updatedAt`) and **never** resolved UI text. Every string the widgets actually display comes from a real native localization table, resolved by the OS at render time from the device's current language — not from a runtime lookup against the app's own i18next instance, and not baked into the snapshot by the JS side.

**iOS** — `targets/widget/<lang>.lproj/Localizable.strings`, one directory per supported language, each a standard `"Key" = "Value";` table. The Swift code already calls `String(localized: "...")` with the literal English text as the key (no custom string table/bundle needed — that's the default resolution `String(localized:)` uses). The 14 languages mirror `app.config.js`'s `ios.infoPlist.CFBundleLocalizations`: `en, da, fi, fr, de, it, ja, ko, no, es, sv, th, zh-Hans, zh-Hant`.
  - **How these get bundled:** `@bacons/apple-targets` adds the entire `targets/widget/` directory to the Xcode project as a single Xcode-16 "file system synchronized group" (`PBXFileSystemSynchronizedRootGroup` — see `with-xcode-changes.js`), not as a hand-picked file list. Any file placed under `targets/widget/`, including `.lproj` folders, is therefore picked up automatically the same way it would be if you'd dragged it into the project in Xcode's UI — Xcode natively understands `.lproj` folders as localized resources once they're part of the target's tree. This was inferred from reading `@bacons/apple-targets`' source rather than confirmed on a real device build yet; if a fresh prebuild + build somehow doesn't pick up a non-English locale, that's the first place to look, but no extra `expo-target.config.js` field should be needed.

**Android** — `plugins/android-widget/res/values*/strings.xml`, mirroring the same 14 languages plus two extra directories for robustness:
  - `values-nb` in addition to `values-no` — both hold identical content. Android's resource-qualifier resolution between the plain ISO 639-1 "no" and the BCP-47 "nb" (Bokmål) qualifier isn't fully consistent across OS versions, and modern Android devices commonly report the system locale as "nb" for Norwegian — shipping both avoids a device silently falling back to English.
  - `values-b+zh+Hans` / `values-b+zh+Hant` (not the legacy `values-zh-rCN`/`values-zh-rTW`) — the modern BCP-47 script-qualifier form, currently the recommended way to differentiate Simplified/Traditional Chinese on Android. Flagged for on-device verification on very old Android versions if that ever matters.
  - `plugins/withAndroidWidget.js` merges each locale directory's `strings.xml` into the matching `android/app/src/main/res/values*/strings.xml` on every prebuild — by key, not by file replacement, so any *other* string resource Expo/RN or another plugin already put in that same file (e.g. `app_name`) is preserved, not overwritten. `TryggdWidget.kt` reads these via `context.getString(R.string.tryggd_widget_*)`.
  - Only 11 of the app's widget-visible strings are needed on Android (vs. 17 on iOS) — Android has no Lock Screen widgets, so the Lock Screen-only strings (`configurationDisplayName`/`description` for the two shortcut widgets, the short "Checked In"/"Money Help" compact labels) simply don't exist as Android resources.

**Adding a new widget string:** add the English literal to both `TryggdWidget.swift` (`String(localized: "...")`) and, if Android needs it too, a new `R.string.tryggd_widget_*` key referenced from `TryggdWidget.kt` — then add the translated value to every `.lproj`/`values*` directory. Missing a locale isn't a build error on either platform; it silently falls back to the default-language value, which is safe but worth checking for deliberately (a str missing from just one locale is easy to miss visually).

## 7. Privacy

The widget shows only the current user's own state — explicitly **none** of the following, all of which V1 either showed or could have been extended to show: contact names, contact check-in times, locations, other people's moods/statuses, private notes, absence/overdue warnings, fraud-alert history, or any other trusted-circle detail. This is the whole point of the V2 rewrite (§0), not an incidental property — if you're ever asked to "just add the contact's name back for context," that's a product conversation to have explicitly, not a small addition.

Push notifications are completely unaffected by any of this — this feature never touches `lib/notifications/`. The widget is a shortcut/reminder, not a replacement for notifications.

## 8. States implemented

**Home Screen (iOS `.systemSmall`/`.systemMedium`, Android — one adaptive layout):**

| State | Copy (see §6 for the exact per-locale strings) |
|---|---|
| Logged out | "Tryggd 💚 — Open Tryggd to connect with your trusted circle. — [Open Tryggd]" |
| Logged in, not checked in today | "Tryggd 💚 — Let your people know you're OK. — [Check In] — Need help? — [Asked to Send Money]" |
| Logged in, checked in today | "Tryggd 💚 — ✓ Checked In Today — Your people know you're OK. — Need help? — [Asked to Send Money]" |

"Asked to Send Money" is **always** present and tappable, regardless of check-in state — it's not conditional on anything, since needing to flag a scam attempt has nothing to do with whether you've checked in yet today.

**Visual hierarchy:** Check In / Open Tryggd use a solid brand-green fill (the calm, everyday, primary action). Asked to Send Money uses a soft amber tint, not a loud solid block — important and easy to find, but not styled to look like an active alert at rest, since the actual alert only ever fires from a deliberate tap inside the app (§3).

**Accessibility:** the checked-in state is never conveyed by the checkmark icon alone — real text ("Checked In Today") is always present alongside it in every state that has room for text at all (VoiceOver/TalkBack always gets real text regardless, including the Lock Screen circular family below, which has no room for visible text). Buttons carry real accessibility labels/hints, not just visual styling.

**Lock Screen (iOS only — `.accessoryCircular` / `.accessoryRectangular` / `.accessoryInline`, two SEPARATE widgets, not one combined widget):**

| Widget | Circular | Rectangular / Inline |
|---|---|---|
| Check In shortcut | hand-wave icon (checkmark if already checked in) | "Check In" / "Checked In" |
| Money Help shortcut | dollar-sign icon | "Asked to Send Money" |

Two separate gallery entries (`TryggdCheckInShortcut`, `TryggdMoneyHelpShortcut`) rather than families of one combined widget — separate, single-purpose shortcuts read more clearly in the very constrained Lock Screen space than one widget trying to hold two actions. Only the Check In shortcut's appearance depends on state; Money Help's never changes, it's a pure shortcut. Android has no Lock Screen widget equivalent (removed from the platform years ago) — `TryggdWidget.kt` is the entire Android surface.

## 9. Required setup — local development

**This project cannot use Expo Go for this feature.** Native modules and extension targets require a custom development client.

Steps, in order:

1. **Set your Apple Team ID.** Open `app.config.js` and set the `APPLE_TEAM_ID` env var (or fill in `ios.appleTeamId` directly). Find it in Xcode (Signing & Capabilities on any target) or at developer.apple.com/account under Membership. **The widget target will not build/sign without this.**
2. **Create the App Group**, if it doesn't already exist, in your Apple Developer account: `group.com.marcustechnology.tryggd.widget` (Certificates, Identifiers & Profiles → Identifiers → App Groups). `@bacons/apple-targets` attaches it to both the app and widget targets automatically from `app.config.js`/`expo-target.config.js` on prebuild, but the App Group ID itself has to exist on Apple's side first.
3. Install dependencies: `npm install` (picks up `xml2js`, newly added for the Android localization merge — see §2/§6).
4. **iOS:** `npx expo prebuild -p ios --clean`, then `npx expo run:ios --device` if testing on a physical phone (`npx expo run:ios` without `--device` silently targets the Simulator instead) — or open `ios/tryggd.xcworkspace` in Xcode (Xcode 16 / macOS 15 required per `@bacons/apple-targets`) and build from there so you can select/run the widget target directly.
5. **Android:** `npx expo prebuild -p android --clean`, then `npx expo run:android`.
6. Add the widgets to a Home Screen (long-press Home Screen → Widgets → Tryggd, on both platforms) and to the Lock Screen on iOS (Lock Screen → Customize → tap below the clock → +, search "Tryggd" — two separate entries for Check In and Money Help).

## 10. Required setup — production builds (EAS)

- `eas.json`'s existing profiles don't need new fields for this — `@bacons/apple-targets` documents that EAS Build's own codesigning handles extension targets automatically once the App Group + Team ID are correctly set (§9).
- Because this changes native code, this requires a **new native build** — an EAS Update / OTA update alone will *not* ship widget changes to existing installs. Run a real `eas build` for both platforms.
- `runtimeVersion.policy: "fingerprint"` (already the case here) — a native change naturally produces a new fingerprint/runtime version; that's correct and expected.

## 11. Apple / Android configuration checklist

**Apple (required, manual, one-time):**
- [ ] App Group `group.com.marcustechnology.tryggd.widget` created in your Apple Developer account.
- [ ] `ios.appleTeamId` set in `app.config.js` (or `APPLE_TEAM_ID` env var).
- [ ] Xcode 16 / macOS 15+, CocoaPods ≥ 1.16.2 on whatever machine actually builds this.
- [ ] If you use a Provisioning Profile / manual signing workflow rather than automatic signing, you'll need a profile for the `com.marcustechnology.tryggd.widget` bundle id too.

**Android:** nothing extra to register anywhere (no App-Group-equivalent, no separate bundle id/target to provision) — the widget ships as part of the normal app package. Just make sure a real build (not Expo Go) is what you're testing with.

## 12. Testing checklist

Core action flow:
- [ ] Widget can be added on iOS (Home Screen widget gallery)
- [ ] Widget can be added on Android
- [ ] Tapping Check In deep-links into the app and lands on the normal check-in flow (not a blank/wrong screen)
- [ ] Completing a check-in from the app updates the widget to "Checked In Today" without needing to remove/re-add it
- [ ] Tapping Asked to Send Money deep-links into Help mode — and does **not** send any alert on its own; a further deliberate tap inside the app is still required
- [ ] **Decide and confirm:** should the `?mode=help` deep link be reachable for free-tier accounts? (§3 — currently yes, which may not match the in-app Plus gating)
- [ ] A failed check-in (network error, etc.) does NOT mark the widget as checked in
- [ ] Daily reset: widget correctly reverts to "Check In" the next local day — verify at least once on a real device across an actual midnight, not just by forcing the clock (iOS's midnight-timeline-entry mechanism specifically, §4)
- [ ] Traveling across time zones doesn't produce a confusing checked-in/not-checked-in flip (§4's `Calendar.current` reasoning)

Account state:
- [ ] Logged out state matches the copy in §8, never shows a previous account's data
- [ ] Logout clears the widget immediately (shows the logged-out state)
- [ ] Switching accounts without signing out first does not show the previous account's state even briefly
- [ ] Checking in on Device A, then opening the app (not necessarily the widget) on Device B, updates Device B's widget on next render (§5)

Localization (§6):
- [ ] Device set to at least one non-English supported language — widget text (Home Screen AND both Lock Screen shortcuts on iOS) renders in that language, not English
- [ ] No widget text is missing/falls back to a raw string key (would indicate a `.strings`/`strings.xml` file wasn't bundled — see §6's Xcode file-system-synchronized-group note for iOS, or `withAndroidWidget.js`'s merge step for Android)
- [ ] Norwegian and both Chinese variants specifically — these use non-obvious resource qualifiers on Android (§6)

Layout / accessibility:
- [ ] Small and medium Home Screen layouts both render correctly on iOS
- [ ] Dynamic Type / large system font sizes don't break either button's layout
- [ ] VoiceOver (iOS) / TalkBack (Android) reads meaningful labels for both actions, not just "button"
- [ ] Both Lock Screen shortcut widgets (Check In, Money Help) can be added as separate gallery entries and render correctly across circular/rectangular/inline

Regression:
- [ ] Existing push notifications still work unchanged
- [ ] Existing Activity screen check-in data/behavior is unaffected (no shared code path was touched — see §1)
- [ ] App still builds normally on both platforms

## 13. Known limitations / what to check first if something's wrong

- **"Widget shows nothing" on iOS** almost always means an App Group ID mismatch between the three places it's declared: `app.config.js`, `targets/widget/expo-target.config.js` (mirrors it automatically, but confirm after prebuild), and the literal string in `modules/tryggd-widget-bridge/ios/TryggdWidgetBridgeModule.swift` / `targets/widget/TryggdWidget.swift`. `UserDefaults(suiteName:)` fails silently (returns nil) on a mismatch — there's no error to point you at it.
- **"Widget shows nothing" on Android** — check the `WIDGET_RECEIVER_CLASS_NAME` string in `modules/tryggd-widget-bridge/android/.../TryggdWidgetBridgeModule.kt` matches the actual package/class of `TryggdWidgetReceiver.kt` once copied into `android/app/src/main/java/...` — the bridge deliberately doesn't have a compile-time reference to it, so a rename on one side without the other fails silently too.
- **Android's "Checked In Today" can cosmetically linger a bit past local midnight** if nothing re-renders the widget overnight — see §4. Not a bug, a documented platform difference from iOS.
- **Android's Compose-compiler Gradle wiring** (`withAndroidWidgetGradle`/`withAndroidWidgetRootGradle` in `plugins/withAndroidWidget.js`) is modeled on the pattern `expo-modules-core` itself uses, but — same as in V1 — hasn't been exercised against a fresh Gradle sync from this environment. Budget time for a first real Android build to shake out anything here.
- **`ColorProvider`'s import path** (`androidx.glance.unit.ColorProvider` in `TryggdWidget.kt`) has moved between Glance versions historically; see the code comment at that import if it fails to resolve.
- **Rounded corners were deliberately skipped on the Android action buttons** (plain rectangular fills instead) — Glance's corner-radius API has also moved around between versions, and this was left out to avoid a similar version-specific compile risk rather than because it's undesirable visually. Safe to add back once verified against the pinned Glance version on a real build.

## 14. Appendix — real-device issues found and fixed during V1 bring-up (still relevant)

These were found and fixed on a physical iPhone/simulator while getting the *original* "My Circle" widget working, before the V2 rewrite. The specific symptom in each case involved UI that no longer exists (contact rows, circle status), but the underlying root causes and fixes are general WidgetKit/Xcode issues that are still baked into the V2 `TryggdWidget.swift` and `expo-target.config.js` — kept here so nobody re-discovers them the hard way.

**Widget didn't appear in the widget gallery at all, despite the `.appex` building and embedding correctly.** Root cause: `expo-target.config.js` pointed `INFOPLIST_FILE` at `targets/widget/Info.plist`, but that file didn't exist, so the extension's Info.plist was missing `NSExtension` → `NSExtensionPointIdentifier = com.apple.widgetkit-extension`. Without it, iOS never lists the extension as a widget, with no build error anywhere. **Fix:** added `targets/widget/Info.plist` with that key — still in place, still required, unrelated to the V2 content rewrite.

**Widget appeared in the gallery but rendered as a blank white square.** Root cause: `expo-target.config.js`'s `colors` config was supposed to generate an `Assets.xcassets` with named colorsets, but no `.xcassets` ever actually appeared under the widget target on a real prebuild — so every `Color("name")` reference silently resolved to nothing (SwiftUI doesn't error on a missing named color, it just renders invisibly). **Fix, still true in V2:** `TryggdWidget.swift` never references named/asset-catalog colors — every color is a hardcoded Swift `Color` value.

**Content was crushed/unreadable inside the widget's bounds.** Root cause: on iOS 17+, `.containerBackground(for: .widget)` makes the background edge-to-edge, but the system still applies its own standard content margins to the foreground on top of whatever padding the view itself adds — the two insets stack. **Fix, still true in V2:** `.contentMarginsDisabled()` is applied to the Home Screen `TryggdWidget` configuration (not the Lock Screen accessory widgets, which don't need it). This is *why* `expo-target.config.js`'s `deploymentTarget` is `'17.0'` — `contentMarginsDisabled()` is iOS 17+ only, and `if #available` branching at the `WidgetConfiguration` builder level isn't supported (the two branches come back as mismatched opaque types and fail to compile), so the whole extension target's minimum OS was raised instead of working around the builder limitation. This only affects who can install the widget extension, not the main app's own minimum iOS version.

**Reminder — Home Screen vs Lock Screen widgets are two separate galleries on iOS.** Long-press the Home Screen icon grid for the action widget; use Lock Screen → Customize → tap below the clock → + for the two shortcut widgets. They will never show up in each other's picker.
