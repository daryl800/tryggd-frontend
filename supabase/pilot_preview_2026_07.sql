-- Activate Plus Preview pilot campaign (deadline: 2026-07-31 23:59:59 +08:00)
update public.app_settings set
  pilot_preview_enabled      = true,
  pilot_preview_campaign_id  = 'pilot_plus_preview_2026_07',
  pilot_preview_ends_at      = '2026-07-31T23:59:59+08:00'
where id = 1;
