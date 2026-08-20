// lib/notifications/homeStatusTypes.ts
//
// Which `notifications` table rows count as "home status" activity — the
// stuff shown in the bottom status card on app/(tabs)/index.tsx (and, as
// of the Lock Screen widget's "full parity" mode, on the widget too).
//
// Extracted out of index.tsx so the widget's own fetch (in
// contexts/ContactCheckinsContext.tsx, see docs/home-screen-widget.md) can
// use the exact same filter — if this list changes, both places pick it
// up automatically instead of silently disagreeing about what counts as
// "home status" activity.

export const HOME_STATUS_NOTIFICATION_TYPES = [
  'welfare_check',
  'emergency_message',
  'checkin_response',
  'call_me_now',
  'money_transfer_help',
] as const;

export type HomeStatusNotificationType = (typeof HOME_STATUS_NOTIFICATION_TYPES)[number];
