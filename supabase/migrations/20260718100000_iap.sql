-- IAP tables for tracking subscriptions and purchase events.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  product_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, product_id)
);

CREATE TABLE IF NOT EXISTS public.purchase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  transaction_id text NOT NULL,
  product_id text NOT NULL,
  event_type text NOT NULL,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS purchase_events_user_id_idx ON public.purchase_events (user_id);
CREATE INDEX IF NOT EXISTS purchase_events_transaction_id_idx ON public.purchase_events (transaction_id);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can write subscriptions (via Edge Functions)
CREATE POLICY "Service role can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Only service role can write purchase events
CREATE POLICY "Service role can manage purchase events"
  ON public.purchase_events FOR ALL
  USING (auth.role() = 'service_role');
