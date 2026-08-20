// targets/widget/TryggdWidget.swift
//
// Tryggd's widgets — an ACTION SURFACE, not a status dashboard. See
// docs/home-screen-widget.md for the full history: V1 showed trusted
// contacts' check-in status, but that data could only ever be as fresh as
// the last time the app itself was open (widgets can't poll in the
// background), and a stale "hasn't checked in in 2 days" for someone who
// actually just checked in caused real confusion/worry — exactly what
// this app exists to prevent. V2 shows ONLY the current user's own
// check-in completion (reliable — it's always initiated from this
// device) plus two always-available actions:
//   - Check In: "I'm okay"
//   - Asked to Send Money: the existing anti-fraud alert flow
//
// Three widgets in this file's bundle:
//   TryggdWidget            — Home Screen (.systemSmall / .systemMedium)
//   TryggdCheckInShortcut   — Lock Screen shortcut for Check In
//   TryggdMoneyHelpShortcut — Lock Screen shortcut for Asked to Send Money
// Lock Screen shortcuts are deliberately two SEPARATE widgets (two
// separate gallery entries), not two families of one combined widget —
// separate, single-purpose shortcuts read more clearly in the very
// constrained Lock Screen space than one widget trying to hold both
// actions.
//
// Data flow: modules/tryggd-widget-bridge (Swift, runs in the main app
// process) writes a JSON snapshot into this App Group's shared
// UserDefaults and calls WidgetCenter.reloadAllTimelines() — from
// app/(tabs)/index.tsx, at the exact points that screen already tracks
// the user's own check-in state (a successful check-in, a Supabase sync
// that discovers a check-in from another device, and a reset). This file
// reads that same UserDefaults from the widget extension's own process.
//
// IMPORTANT: appGroupId and snapshotKey below must exactly match the
// constants in modules/tryggd-widget-bridge/ios/TryggdWidgetBridgeModule.swift.
//
// Tapping any action opens the main app and deep-links to the existing
// screen/flow (see the URL constants below) — this file does NOT
// duplicate check-in or anti-fraud-alert logic. In particular, tapping
// "Asked to Send Money" only OPENS the existing Help flow; it does not
// send the alert itself. That requires a deliberate tap inside the app —
// see the comment on moneyHelpURL.
import SwiftUI
import WidgetKit

// MARK: - Brand colors
//
// Hardcoded rather than referenced via Color("name") from an asset
// catalog — see git history / docs/home-screen-widget.md for why: on a
// real device build, @bacons/apple-targets' `colors` config never
// actually generated an Assets.xcassets for this target, which silently
// made every Color("...") reference resolve to nothing and rendered all
// text invisible. Built on UIColor's trait-based dynamic provider so
// these still flip correctly with light/dark appearance without an asset
// catalog.
private func uiColor(hex: UInt32) -> UIColor {
  UIColor(
    red: CGFloat((hex >> 16) & 0xFF) / 255,
    green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255,
    alpha: 1
  )
}

private func adaptiveColor(light: UInt32, dark: UInt32) -> Color {
  Color(UIColor { traits in
    traits.userInterfaceStyle == .dark ? uiColor(hex: dark) : uiColor(hex: light)
  })
}

private let checkGreen = adaptiveColor(light: 0x5FA893, dark: 0x6FBBA5)
private let attentionAmber = adaptiveColor(light: 0xF59E0B, dark: 0xF5A623)
private let attentionAmberSoftBackground = adaptiveColor(light: 0xFEF3C7, dark: 0x3A2E10)
private let textDark = adaptiveColor(light: 0x1F2937, dark: 0xF3F4F6)
private let textMuted = adaptiveColor(light: 0x5E7F74, dark: 0x9CA3AF)
private let widgetBackground = adaptiveColor(light: 0xFBFBFA, dark: 0x1C1C1E)

// MARK: - Shared config (must match the bridge module + app.config.js)

private let appGroupId = "group.com.marcustechnology.tryggd.widget"
private let snapshotKey = "widgetSnapshotJSON"

// MARK: - Deep link targets
//
// See docs/home-screen-widget.md "Deep linking". Both reuse the existing
// Home tab route rather than introducing a new one — "mode=help"/"mode=home"
// are read by a small effect in app/(tabs)/index.tsx that calls the SAME
// handleCheckinModeChange the in-app tabs already use, so there's exactly
// one place that knows how to switch tabs.
//
// checkInURL explicitly forces the Daily tab rather than opening a bare
// "tryggd://" — checkinMode is persisted (AsyncStorage/Supabase) and
// restores whatever tab was last active, so a bare deep link could land on
// Trip or Reach Out mode instead if that's where the user left off. The
// widget always shows check-in/streak state for the Daily tab, so tapping
// it should always open to that same tab.
//
// Force-unwrapped: both are static, compile-time-known-valid literals,
// not user input.
private let checkInURL = URL(string: "tryggd://?mode=home")!
// Opens the existing Help / anti-fraud screen — does NOT send the alert.
// A widget tap is easy to trigger by accident (loose pocket, stray touch
// on the Home Screen), so notifying someone's entire trusted circle can
// never be a single accidental tap away. The user must still deliberately
// tap the real "Asked to Send Money" button inside the app itself.
private let moneyHelpURL = URL(string: "tryggd://?mode=help")!

// MARK: - Snapshot model (mirrors lib/widget/types.ts WidgetOwnState)
//
// Deliberately carries NO trusted-circle data and NO resolved UI text —
// see lib/widget/types.ts for why. All display strings in this file come
// from this target's own Localizable.strings tables (targets/widget/*.lproj),
// not from the snapshot.

private struct WidgetOwnStateDTO: Decodable {
  let updatedAt: String
  let isLoggedIn: Bool
  let checkedInToday: Bool
  let lastCheckinUtc: String?
  // The user's own most recent "Asked to Send Money" (money_transfer_help)
  // send — see lib/widget/types.ts. Not reset on day rollover, unlike
  // checkedInToday: a "sent yesterday" alert is still meaningful, not
  // stale in the way an old check-in status would be.
  let lastMoneyAlertSentUtc: String?
}

private func loadOwnState() -> WidgetOwnStateDTO? {
  guard let defaults = UserDefaults(suiteName: appGroupId),
        let json = defaults.string(forKey: snapshotKey),
        let data = json.data(using: .utf8) else {
    return nil
  }
  return try? JSONDecoder().decode(WidgetOwnStateDTO.self, from: data)
}

private let isoFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

private func parseIsoDate(_ value: String?) -> Date? {
  guard let value else { return nil }
  if let date = isoFormatter.date(from: value) { return date }
  let fallback = ISO8601DateFormatter()
  fallback.formatOptions = [.withInternetDateTime]
  return fallback.date(from: value)
}

/// Re-derives "checked in today" from the raw timestamp against the
/// CURRENT local calendar day, rather than only trusting
/// `checkedInToday` as written — that boolean could be a day stale if
/// this widget hasn't been refreshed since (see the timeline's own
/// midnight-rollover entry below for the other half of this — this
/// function is the defense-in-depth for renders that happen for any
/// other reason, e.g. the very last entry before WidgetKit gets around to
/// requesting the next one). Spec: "Handle timezone/date changes
/// sensibly" — Calendar.current always reflects the device's current
/// timezone, so this self-corrects if the user has traveled.
private func isCheckedInNow(_ state: WidgetOwnStateDTO) -> Bool {
  guard state.checkedInToday else { return false }
  guard let lastCheckinUtc = state.lastCheckinUtc, let date = parseIsoDate(lastCheckinUtc) else {
    return state.checkedInToday
  }
  return Calendar.current.isDateInToday(date)
}

// MARK: - Timeline

private struct OwnStateEntry: TimelineEntry {
  let date: Date
  let state: WidgetOwnStateDTO?
}

private let samplePlaceholderState = WidgetOwnStateDTO(
  updatedAt: isoFormatter.string(from: Date()),
  isLoggedIn: true,
  checkedInToday: false,
  lastCheckinUtc: nil,
  lastMoneyAlertSentUtc: nil
)

private struct OwnStateTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> OwnStateEntry {
    OwnStateEntry(date: Date(), state: samplePlaceholderState)
  }

  func getSnapshot(in context: Context, completion: @escaping (OwnStateEntry) -> Void) {
    if context.isPreview {
      completion(OwnStateEntry(date: Date(), state: samplePlaceholderState))
      return
    }
    completion(OwnStateEntry(date: Date(), state: loadOwnState()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<OwnStateEntry>) -> Void) {
    let state = loadOwnState()
    let now = Date()
    var entries: [OwnStateEntry] = [OwnStateEntry(date: now, state: state)]

    // Daily reset (spec §6): if currently checked in, schedule a SECOND
    // entry at the next local midnight showing "not checked in" — this is
    // what makes the widget flip back to "Check In" on its own overnight,
    // even if the app is never reopened between now and then. Without
    // this, the reset would only ever happen the next time the app itself
    // pushes a fresh snapshot (e.g. next app open), which could leave a
    // stale "Checked In Today" showing well into the next day.
    if let state, state.isLoggedIn, state.checkedInToday {
      let calendar = Calendar.current
      if let nextMidnight = calendar.nextDate(
        after: now,
        matching: DateComponents(hour: 0, minute: 0, second: 0),
        matchingPolicy: .nextTime
      ) {
        let resetState = WidgetOwnStateDTO(
          updatedAt: state.updatedAt,
          isLoggedIn: state.isLoggedIn,
          checkedInToday: false,
          lastCheckinUtc: state.lastCheckinUtc,
          lastMoneyAlertSentUtc: state.lastMoneyAlertSentUtc
        )
        entries.append(OwnStateEntry(date: nextMidnight, state: resetState))
      }
    }

    completion(Timeline(entries: entries, policy: .after(entries.last!.date)))
  }
}

// MARK: - Shared button styling (Home Screen widget)

/// CHECK IN is the normal, everyday, calm action — solid brand-green
/// fill, visually primary. See actionButtonSecondary below for why
/// "Asked to Send Money" deliberately looks different (spec: "Do not
/// make the whole widget red" / "important but secondary").
private struct ActionButtonPrimary: View {
  let title: String
  // Optional: the newer emoji-forward copy (see loggedInBody) already
  // carries its own emoji inline in `title`, so a separate SF Symbol next
  // to it would be redundant. Kept optional rather than removed outright
  // because loggedOutBody's "Open Tryggd" button still uses one.
  var systemImage: String? = nil
  var compact: Bool = false

  var body: some View {
    HStack(spacing: 6) {
      if let systemImage {
        Image(systemName: systemImage)
          .font(.system(size: compact ? 12 : 13, weight: .semibold))
      }
      Text(title)
        .font(.system(size: compact ? 12 : 13, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity)
    .padding(.vertical, compact ? 8 : 10)
    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(checkGreen))
    .accessibilityElement(children: .combine)
  }
}

// V2.2 (per direct user feedback — "characters are quite BIG on other
// widgets, ours is too small"): replaced the compact icon+label rows
// below with big hero-style content — a large emoji plus bold text
// instead of a small SF Symbol. ActionButtonSecondary (the old compact
// money button) is gone; BigMoneyAlertButton replaces it. ActionButtonPrimary
// above is kept only for loggedOutBody's "Open Tryggd" button, which
// wasn't part of this feedback.

/// BIG "not checked in yet" prompt — the primary tap target for opening
/// the check-in flow. Only ever rendered inside a Link (never standalone):
/// per spec §6, Check In must disappear as an ACTIVE BUTTON once done for
/// the day — see BigCheckedInStatus below for the read-only counterpart
/// shown once checked in. Doubled 👋🏻👋🏻 and "Please check-in!" wording per
/// direct user feedback. Stacked vertically (emoji line, then label line)
/// rather than one concatenated line — same reasoning as the Lock Screen
/// shortcuts' rectangular case: putting both on one line forces
/// minimumScaleFactor to shrink the emoji down to fit the width, which
/// looked smaller than intended.
private struct BigCheckInPrompt: View {
  var compact: Bool = false

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("👋🏻👋🏻")
        .font(.system(size: compact ? 26 : 32))
        .minimumScaleFactor(0.75)
      Text(String(localized: "Please check-in!"))
        .font(.system(size: compact ? 15 : 17, weight: .bold))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .foregroundStyle(.white)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, compact ? 10 : 12)
    .padding(.horizontal, 12)
    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(checkGreen))
  }
}

/// BIG "already checked in" status — informational only, not wrapped in a
/// Link (nothing left to tap). Shows the actual check-in TIME (per direct
/// user feedback, replacing the earlier generic "Checked In Today") using
/// WidgetKit's native `Text(date, style: .time)` — a locale-formatted
/// absolute clock time (respects the device's 12h/24h setting) that needs
/// no new per-locale strings for the time portion itself. Real VoiceOver
/// text stays the clean "Checked In Today" phrase rather than reading the
/// emoji or the raw time.
private struct BigCheckedInStatus: View {
  var compact: Bool = false
  /// The user's own last check-in, already re-derived as "today" by the
  /// caller (isCheckedInNow) — nil here would only happen if the snapshot
  /// says checkedInToday but somehow has no timestamp, an inconsistent
  /// state this view shouldn't normally see; falls back to the old
  /// wording in that edge case rather than showing a broken time.
  var checkinDate: Date?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("✅")
        .font(.system(size: compact ? 26 : 32))
      if let checkinDate {
        (Text(String(localized: "Last checked-in")) + Text(" ") + Text(checkinDate, style: .time))
          .font(.system(size: compact ? 13 : 15, weight: .bold))
          .lineLimit(1)
          .minimumScaleFactor(0.65)
      } else {
        Text(String(localized: "Check-in Today"))
          .font(.system(size: compact ? 15 : 17, weight: .bold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
    .foregroundStyle(checkGreen)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(String(localized: "Checked In Today"))
  }
}

/// BIG "Send Money Alert" shortcut — always tappable regardless of
/// check-in state. Stacked vertically: bookended 💸⚠️ emoji, the "Send
/// Money Alert!" label, then a smaller "Last sent" line using the SAME
/// data source as the Help screen's own per-button timestamp (see
/// lib/api/helpRequest.ts fetchLastHelpRequestByType — this is not a new
/// tracking mechanism) — "--:--" if the user has never sent one.
private struct BigMoneyAlertButton: View {
  var compact: Bool = false
  var lastSentDate: Date?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("💸⚠️")
        .font(.system(size: compact ? 24 : 28))
      Text(String(localized: "Send Money Alert!"))
        .font(.system(size: compact ? 14 : 16, weight: .bold))
        .lineLimit(1)
        .minimumScaleFactor(0.65)
      (Text("➡️ ") + Text(String(localized: "Last sent")) + Text(" ") + lastSentTimeText)
        .font(.system(size: compact ? 11 : 12, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .opacity(0.85)
    }
    .foregroundStyle(attentionAmber)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, compact ? 10 : 12)
    .padding(.horizontal, 12)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(attentionAmberSoftBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(attentionAmber.opacity(0.4), lineWidth: 1)
    )
  }

  // "--:--" is a literal placeholder (not translated text) — same idea as
  // a stopwatch/timer's zero state, meaningful without translation.
  private var lastSentTimeText: Text {
    if let lastSentDate {
      return Text(lastSentDate, style: .time)
    }
    return Text("--:--")
  }
}

// MARK: - Home Screen widget view

private struct TryggdActionWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: OwnStateEntry

  private var isCompact: Bool { family == .systemSmall }

  var body: some View {
    Group {
      if let state = entry.state, state.isLoggedIn {
        loggedInBody(state)
      } else {
        loggedOutBody
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var titleRow: some View {
    HStack(spacing: 4) {
      Text("Tryggd")
        .font(.system(size: isCompact ? 13 : 15, weight: .bold))
        .foregroundStyle(textDark)
      Text("💚")
        .font(.system(size: isCompact ? 13 : 15))
    }
  }

  // V2.2 (per direct user feedback — big, glanceable content instead of
  // small compact rows): title, then one BIG status/prompt line (👋🏻 before
  // check-in, ✅ after), then one BIG "Send Money" line, always tappable.
  // VoiceOver/TalkBack still get separate, clean accessibilityLabel/Hint
  // text (unchanged) rather than reading the emoji verbatim.
  @ViewBuilder
  private func loggedInBody(_ state: WidgetOwnStateDTO) -> some View {
    let checkedIn = isCheckedInNow(state)
    VStack(alignment: .leading, spacing: isCompact ? 6 : 8) {
      titleRow

      if checkedIn {
        BigCheckedInStatus(compact: isCompact, checkinDate: parseIsoDate(state.lastCheckinUtc))
      } else {
        Link(destination: checkInURL) {
          BigCheckInPrompt(compact: isCompact)
        }
        .accessibilityLabel(String(localized: "Check In"))
        .accessibilityHint(String(localized: "Opens Tryggd to check in"))
      }

      Link(destination: moneyHelpURL) {
        BigMoneyAlertButton(compact: isCompact, lastSentDate: parseIsoDate(state.lastMoneyAlertSentUtc))
      }
      .accessibilityLabel(String(localized: "Asked to Send Money"))
      .accessibilityHint(String(localized: "Opens Tryggd's anti-fraud alert screen"))
    }
  }

  private var loggedOutBody: some View {
    VStack(alignment: .leading, spacing: 8) {
      titleRow
      Text(String(localized: "Open Tryggd to connect with your trusted circle."))
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(textMuted)
        .fixedSize(horizontal: false, vertical: true)
      Link(destination: checkInURL) {
        ActionButtonPrimary(title: String(localized: "Open Tryggd"), systemImage: "arrow.up.forward.circle.fill", compact: isCompact)
      }
    }
  }
}

// MARK: - Lock Screen shortcuts
//
// Two separate, single-purpose widgets rather than families of one
// combined widget — see the file header. Both share the same
// OwnStateTimelineProvider/App Group read; only Check In's appearance
// actually depends on that state (whether it shows "Check In" or
// "Checked In"). Money Help's appearance never changes — it's a pure
// shortcut — so it doesn't need entry data at all.

private struct CheckInShortcutView: View {
  @Environment(\.widgetFamily) var family
  let entry: OwnStateEntry

  private var isCheckedIn: Bool {
    guard let state = entry.state, state.isLoggedIn else { return false }
    return isCheckedInNow(state)
  }

  var body: some View {
    switch family {
    case .accessoryCircular:
      // Same 👋🏻/✅ emoji as the Home Screen widget, as big as a ~50pt
      // circular accessory can reasonably hold — no SF Symbol here
      // anymore. Deliberately NOT .widgetAccentable(): that modifier
      // mono-tints content to the Lock Screen's accent color, which would
      // strip the emoji's own color — same reasoning as the Home Screen's
      // Big* views never tinting their emoji either. The emoji itself is
      // hidden from VoiceOver (accessibilityHidden) in favor of the clean
      // spoken label below, same pattern the Home Screen views use.
      ZStack {
        AccessoryWidgetBackground()
        Text(isCheckedIn ? "✅" : "👋🏻")
          .font(.system(size: 32))
          .minimumScaleFactor(0.7)
          .accessibilityHidden(true)
      }
      .accessibilityLabel(isCheckedIn ? String(localized: "Checked In Today") : String(localized: "Check In"))
    case .accessoryInline:
      // Inline shares a single text line with the clock/other inline
      // items — genuinely no room for BIG anything here, this is a hard
      // OS constraint, not a design choice. Kept as the original compact
      // icon + short label.
      Label(
        isCheckedIn ? String(localized: "Checked In") : String(localized: "Check In"),
        systemImage: isCheckedIn ? "checkmark.circle.fill" : "hand.wave.fill"
      )
    default: // .accessoryRectangular
      // Same wording/emoji as the Home Screen's BigCheckInPrompt /
      // BigCheckedInStatus (👋🏻👋🏻 / "Please check-in!" before, ✅ / "Last
      // checked-in [time]" after — same data source and .time style, see
      // the matching comments there). Top half icon / bottom half text,
      // each exactly half the widget's HEIGHT (GeometryReader) — matching
      // the system alarm widget's layout (big icon on top, one word below,
      // both filling their half). An earlier pass tried a left/right column
      // split instead, but squeezing the text into a half-width column
      // forced minimumScaleFactor to shrink it down — worse than the
      // original problem. Splitting by height instead of width lets both
      // the icon AND the text use the widget's full ~172pt width, so
      // neither has to compete for horizontal room.
      GeometryReader { geo in
        VStack(spacing: 2) {
          Text(isCheckedIn ? "✅" : "👋🏻👋🏻")
            .font(.system(size: 30))
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: geo.size.height * 0.5, alignment: .center)
            .accessibilityHidden(true)
          Group {
            if isCheckedIn, let checkinDate = parseIsoDate(entry.state?.lastCheckinUtc) {
              (Text(String(localized: "Last checked-in")) + Text(" ") + Text(checkinDate, style: .time))
            } else {
              Text(isCheckedIn ? String(localized: "Check-in Today") : String(localized: "Please check-in!"))
            }
          }
          .font(.system(size: 16, weight: .bold))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .frame(maxWidth: .infinity, alignment: .leading)
          .frame(height: geo.size.height * 0.5, alignment: .center)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(isCheckedIn ? String(localized: "Checked In Today") : String(localized: "Check In"))
    }
  }
}

private struct MoneyHelpShortcutView: View {
  @Environment(\.widgetFamily) var family
  let entry: OwnStateEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      // Same 💸 emoji as the Home Screen's BigMoneyAlertButton (dropping
      // the ⚠️ here — a ~50pt circle only comfortably fits one glyph).
      // See the matching comment on CheckInShortcutView for why this
      // isn't .widgetAccentable() and hides the emoji from VoiceOver in
      // favor of the explicit label below.
      ZStack {
        AccessoryWidgetBackground()
        Text("💸")
          .font(.system(size: 32))
          .minimumScaleFactor(0.7)
          .accessibilityHidden(true)
      }
      .accessibilityLabel(String(localized: "Asked to Send Money"))
    case .accessoryInline:
      // No room for BIG anything on a single shared inline text line —
      // hard OS constraint, same as CheckInShortcutView's inline case.
      Label(String(localized: "Asked to Send Money"), systemImage: "dollarsign.circle.fill")
    default: // .accessoryRectangular
      // Same bookended 💸⚠️ emoji + "Send Money Alert!" wording + "Last
      // sent" line as the Home Screen's BigMoneyAlertButton (same data
      // source — see lib/api/helpRequest.ts). Top half icon / bottom half
      // text, matching the system alarm widget's layout — see the matching
      // comment on CheckInShortcutView's rectangular case for why this
      // replaced an earlier left/right column attempt (which squeezed the
      // text and made it shrink).
      GeometryReader { geo in
        VStack(spacing: 2) {
          Text("💸⚠️")
            .font(.system(size: 26))
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: geo.size.height * 0.5, alignment: .center)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 1) {
            Text(String(localized: "Send Money Alert!"))
              .font(.system(size: 14, weight: .bold))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            (Text("➡️ ") + Text(String(localized: "Last sent")) + Text(" ") + lastSentTimeText)
              .font(.system(size: 11, weight: .semibold))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .opacity(0.85)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .frame(height: geo.size.height * 0.5, alignment: .center)
        }
      }
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(String(localized: "Asked to Send Money"))
    }
  }

  // "--:--" is a literal placeholder (not translated text), same as the
  // matching helper on the Home Screen's BigMoneyAlertButton.
  private var lastSentTimeText: Text {
    if let lastSentDate = parseIsoDate(entry.state?.lastMoneyAlertSentUtc) {
      return Text(lastSentDate, style: .time)
    }
    return Text("--:--")
  }
}

// MARK: - Widget declarations

struct TryggdWidget: Widget {
  let kind: String = "TryggdWidget"

  // NOTE: this target's deploymentTarget is 17.0 (see
  // targets/widget/expo-target.config.js). Two reasons: contentMarginsDisabled()
  // below is iOS 17+ only (needed to avoid the system doubling up on
  // content margins — see docs/home-screen-widget.md), and per-element
  // Link() tap targets inside a single Home Screen widget (used here so
  // Check In and Asked to Send Money are independently tappable in the
  // same medium widget) are also an iOS 17+ WidgetKit capability.
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OwnStateTimelineProvider()) { entry in
      TryggdActionWidgetView(entry: entry)
        .containerBackground(for: .widget) {
          widgetBackground
        }
    }
    .configurationDisplayName("Tryggd")
    .description(String(localized: "Check in, or let your circle know something's wrong."))
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}

struct TryggdCheckInShortcut: Widget {
  let kind: String = "TryggdCheckInShortcut"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OwnStateTimelineProvider()) { entry in
      CheckInShortcutView(entry: entry)
        .widgetURL(checkInURL)
        // iOS 17 requires every widget family — including Lock Screen
        // accessory families — to opt in via containerBackground, or
        // WidgetKit shows a "Please adopt containerBackground API"
        // placeholder instead of the real view. Color.clear is correct
        // here (not widgetBackground): the Lock Screen renders its own
        // system chrome behind accessory widgets regardless of what's
        // provided, same as Apple's own accessory-widget sample code.
        .containerBackground(for: .widget) {
          Color.clear
        }
    }
    .configurationDisplayName(String(localized: "Tryggd — Check In"))
    .description(String(localized: "Quickly let your people know you're OK."))
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

struct TryggdMoneyHelpShortcut: Widget {
  let kind: String = "TryggdMoneyHelpShortcut"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: OwnStateTimelineProvider()) { entry in
      MoneyHelpShortcutView(entry: entry)
        .widgetURL(moneyHelpURL)
        // See the matching comment on TryggdCheckInShortcut above.
        .containerBackground(for: .widget) {
          Color.clear
        }
    }
    .configurationDisplayName(String(localized: "Tryggd — Asked to Send Money"))
    .description(String(localized: "Quickly open Tryggd's anti-fraud alert screen."))
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}

@main
struct TryggdWidgetBundle: WidgetBundle {
  var body: some Widget {
    TryggdWidget()
    TryggdCheckInShortcut()
    TryggdMoneyHelpShortcut()
  }
}
