-- help_alerts_toggle.sql
-- Adds per-contact Help-mode alert opt-out flag (v4.7.0).
-- Default true — safety-critical feature must be on unless explicitly disabled.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS help_alerts_enabled boolean NOT NULL DEFAULT true;
