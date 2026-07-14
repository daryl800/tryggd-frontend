-- ============================================================
-- Watch Over feature
-- ============================================================

-- 1. Per-contact watch toggle
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS watch_over_enabled boolean NOT NULL DEFAULT false;

-- 2. Away status on profiles (suppresses absence detection while set)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS away_until timestamptz,
  ADD COLUMN IF NOT EXISTS away_label text;

-- 3. One episode per watched user per absence period
CREATE TABLE IF NOT EXISTS public.watch_over_episodes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  watched_user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  absence_start_at     timestamptz NOT NULL,
  resolved_at          timestamptz,
  resolved_by_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_at             timestamptz,
  status               text        NOT NULL DEFAULT 'active'
                                   CHECK (status IN ('active', 'resolved', 'ended')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watch_over_episodes_watched_status_idx
  ON public.watch_over_episodes (watched_user_id, status);

-- 4. Per-watcher notification tracking (idempotency + bundling)
CREATE TABLE IF NOT EXISTS public.watch_over_notifications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id       uuid        NOT NULL REFERENCES public.watch_over_episodes(id) ON DELETE CASCADE,
  watcher_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day1_sent_at     timestamptz,
  day2_sent_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id, watcher_user_id)
);

CREATE INDEX IF NOT EXISTS watch_over_notifications_watcher_idx
  ON public.watch_over_notifications (watcher_user_id);

-- 5. RLS
ALTER TABLE public.watch_over_episodes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_over_notifications ENABLE ROW LEVEL SECURITY;

-- Watchers can read episodes for contacts they watch
CREATE POLICY "watchers_can_view_episodes"
  ON public.watch_over_episodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.owner_user_id = auth.uid()
        AND contacts.contact_user_id = watch_over_episodes.watched_user_id
        AND contacts.watch_over_enabled = true
    )
  );

-- Each watcher can read their own notification rows
CREATE POLICY "users_view_own_watchover_notifications"
  ON public.watch_over_notifications FOR SELECT
  USING (watcher_user_id = auth.uid());
