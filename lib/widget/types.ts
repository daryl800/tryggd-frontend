// lib/widget/types.ts
//
// Shape of the small snapshot written to native shared storage (iOS App
// Group UserDefaults / Android SharedPreferences) so the widgets can
// render without talking to Supabase directly.
//
// V2 (see docs/home-screen-widget.md): the widget is an ACTION SURFACE —
// "Check In" / "Asked to Send Money" — not a trusted-circle status
// dashboard. It shows only the CURRENT USER's own check-in completion
// state, never another person's data. This is a deliberate revert of the
// earlier "My Circle" trusted-contact-status widget: that data could be
// stale (refreshed only while the app is running — see the real-device
// findings in docs/home-screen-widget.md), and showing a stale "Anna — 2
// days since check-in" when Anna actually checked in recently caused
// exactly the kind of confusion/unnecessary worry this app exists to
// prevent. The user's OWN check-in, by contrast, is always initiated from
// this device, so it can be reliably persisted and pushed the moment it
// succeeds — no staleness problem.
//
// Deliberately language-neutral: no resolved UI text lives in this
// snapshot. The native widgets render their own text from real per-locale
// localization tables (targets/widget/*.lproj/Localizable.strings on iOS,
// plugins/android-widget/res/values-*/strings.xml on Android) — see
// docs/home-screen-widget.md "Localization".

/** The full state written to shared storage for the native widgets to read. */
export type WidgetOwnState = {
  /** ISO 8601 UTC timestamp of when this snapshot was produced. */
  updatedAt: string;
  /** Whether a user is currently signed in. When false, everything else is ignored by the native side. */
  isLoggedIn: boolean;
  /**
   * Whether the user has completed today's check-in, as of `updatedAt`.
   * The native side additionally re-derives this from `lastCheckinUtc`
   * against the CURRENT local calendar day at render time (and, on iOS,
   * schedules a timeline entry at the next local midnight) — so the
   * widget still resets correctly even if the app hasn't been reopened
   * since yesterday. This field is a starting point, not solely trusted
   * forever. See docs/home-screen-widget.md "Daily reset".
   */
  checkedInToday: boolean;
  /** ISO 8601 UTC timestamp of the user's own last check-in, or null if they've never checked in. */
  lastCheckinUtc: string | null;
  /**
   * ISO 8601 UTC timestamp of the user's own most recent
   * `money_transfer_help` help_requests row (see lib/api/helpRequest.ts —
   * this is the SAME data source that already powers the "last sent" line
   * under the Help screen's money button, not a new tracking mechanism),
   * or null if they've never sent one. Unlike `checkedInToday`, this is
   * NOT reset on day rollover — a "sent yesterday" alert is still
   * meaningful context, not stale in the way an old check-in status is.
   */
  lastMoneyAlertSentUtc: string | null;
};

export const EMPTY_WIDGET_OWN_STATE: WidgetOwnState = {
  updatedAt: new Date(0).toISOString(),
  isLoggedIn: false,
  checkedInToday: false,
  lastCheckinUtc: null,
  lastMoneyAlertSentUtc: null,
};
