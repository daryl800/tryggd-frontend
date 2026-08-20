// lib/recencyStatus.ts
//
// Pure client-side classification of how recent a check-in timestamp is,
// into the same 'today' | 'yesterday' | 'older' | 'none' buckets the
// backend's own `recency_status` field uses (see app/(tabs)/activity.tsx,
// the `Activity['recency_status']` type and `getFallbackRecencyStatus`).
//
// Extracted out of activity.tsx so lib/widget/snapshot.ts can use the
// *exact* same definition of "overdue" that the Activity screen does,
// instead of an independently-invented threshold. Previously the widget
// used a naive "more than 24 rolling hours since last check-in" rule,
// which disagreed with the Activity screen often enough to be reported as
// a bug (widget said "All checked in" while Activity showed something
// else for the same contact) — see docs/home-screen-widget.md.
//
// NOTE the day-boundary quirk: a check-in/now at hour >= 23 UTC is treated
// as belonging to the *next* calendar day. This isn't arbitrary — it
// matches how the backend buckets recency_status server-side. Don't
// "simplify" this without checking that stays true; do it here and in
// activity.tsx's getFallbackRecencyStatus together, not just one place.

export type RecencyStatus = 'today' | 'yesterday' | 'older' | 'none';

export function computeRecencyStatus(timestamp: string | null | undefined): RecencyStatus {
  if (!timestamp) {
    return 'none';
  }

  try {
    const lastCheckIn = new Date(timestamp);
    const now = new Date();

    const lastDateStr = lastCheckIn.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const lastHour = lastCheckIn.getUTCHours();
    const nowHour = now.getUTCHours();

    let adjustedLastDate = lastDateStr;
    if (lastHour >= 23) {
      const nextDay = new Date(lastCheckIn);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      adjustedLastDate = nextDay.toISOString().split('T')[0];
    }

    let adjustedToday = todayStr;
    if (nowHour >= 23) {
      const nextDay = new Date(now);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      adjustedToday = nextDay.toISOString().split('T')[0];
    }

    if (adjustedLastDate === adjustedToday) {
      return 'today';
    }

    const yesterday = new Date(adjustedToday);
    const yesterdayParts = adjustedToday.split('-').map(Number);
    yesterday.setUTCFullYear(yesterdayParts[0], yesterdayParts[1] - 1, yesterdayParts[2] - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (adjustedLastDate === yesterdayStr) {
      return 'yesterday';
    }

    return 'older';
  } catch {
    return 'none';
  }
}

/** The widget's (and this function's callers') single definition of
 * "needs attention": genuinely overdue by the app's own day-bucketed
 * recency status ('older'), or never checked in at all ('none'). A
 * same-day or "yesterday" check-in is a normal gap, not something to flag
 * — matches the calm-tone requirement in docs/home-screen-widget.md. */
export function isOverdueForWidget(timestamp: string | null | undefined): boolean {
  const status = computeRecencyStatus(timestamp);
  return status === 'older' || status === 'none';
}
