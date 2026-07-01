-- Add Aliyun Push device ID to user_push_tokens for China Android users
-- who lack Google Play Services and cannot receive Expo/FCM push notifications.
ALTER TABLE user_push_tokens
  ADD COLUMN IF NOT EXISTS aliyun_device_id TEXT;
