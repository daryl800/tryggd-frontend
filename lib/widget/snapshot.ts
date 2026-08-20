// lib/widget/snapshot.ts
//
// Turns the app's own check-in state into the small WidgetOwnState written
// to shared storage for the native widgets. Pure function, no
// native/platform imports here — see lib/widget/types.ts for why this
// carries only the user's own state, not trusted-circle data.

import { EMPTY_WIDGET_OWN_STATE, WidgetOwnState } from './types';

/**
 * Builds a WidgetOwnState from the same check-in state app/(tabs)/index.tsx
 * already tracks locally (see its `checkedInToday`/`lastCheckinUtc` state
 * and `@checkin_state` AsyncStorage key). Called from the same three
 * places that state is written: a successful check-in, a Supabase sync
 * that discovers a check-in from another device, and a local-day
 * rollover reset — see docs/home-screen-widget.md "Data flow".
 */
export function buildWidgetOwnState(
  isLoggedIn: boolean,
  checkedInToday: boolean,
  lastCheckinUtc: string | null,
  lastMoneyAlertSentUtc: string | null
): WidgetOwnState {
  if (!isLoggedIn) {
    return { ...EMPTY_WIDGET_OWN_STATE, isLoggedIn: false, updatedAt: new Date().toISOString() };
  }

  return {
    updatedAt: new Date().toISOString(),
    isLoggedIn: true,
    checkedInToday,
    lastCheckinUtc,
    lastMoneyAlertSentUtc,
  };
}
