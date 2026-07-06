-- Track whether the user granted OS-level notification permission at last registration.
-- NULL = never registered (pre-migration rows); true/false = last known state.
ALTER TABLE user_push_tokens
  ADD COLUMN IF NOT EXISTS notification_permission_granted BOOLEAN;
