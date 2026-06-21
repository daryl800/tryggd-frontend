-- Add Aliyun Push device ID column to user_push_tokens.
-- Used to route push notifications to China Android users via Aliyun instead of Expo/FCM.
alter table public.user_push_tokens
    add column if not exists aliyun_device_id text;
