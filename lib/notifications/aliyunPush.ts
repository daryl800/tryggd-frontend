import { Platform } from 'react-native';
import { supabase } from '../supabase';

// Aliyun Push is Android-only — Chinese iOS users can receive pushes via APNs/Expo normally.
const IS_ANDROID = Platform.OS === 'android';

let initialized = false;

export async function initAliyunPush(): Promise<void> {
  if (!IS_ANDROID) return;
  try {
    // Dynamic import so the native module is not referenced on iOS/web
    const ExpoAliyunPush = (await import('expo-aliyun-push')).default;
    await ExpoAliyunPush.initAliyunPush();
    await ExpoAliyunPush.initThirdPush();
    initialized = true;
    console.log('✅ Aliyun Push initialized');
  } catch (error: any) {
    console.warn('⚠️ Aliyun Push init error:', error?.message ?? error);
  }
}

export async function bindAliyunAccount(userId: string): Promise<void> {
  if (!IS_ANDROID || !initialized) return;
  try {
    const ExpoAliyunPush = (await import('expo-aliyun-push')).default;
    const deviceId = await ExpoAliyunPush.getDeviceId();
    await ExpoAliyunPush.bindAccount(userId);

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({ user_id: userId, aliyun_device_id: deviceId }, { onConflict: 'user_id' });

    if (error) {
      console.warn('⚠️ Failed to save Aliyun device ID:', error.message);
    } else {
      console.log('✅ Aliyun account bound, device ID:', deviceId);
    }
  } catch (error: any) {
    console.warn('⚠️ Aliyun bind error:', error?.message ?? error);
  }
}

export async function unbindAliyunAccount(): Promise<void> {
  if (!IS_ANDROID || !initialized) return;
  try {
    const ExpoAliyunPush = (await import('expo-aliyun-push')).default;
    await ExpoAliyunPush.unbindAccount();
    console.log('✅ Aliyun account unbound');
  } catch (error: any) {
    console.warn('⚠️ Aliyun unbind error:', error?.message ?? error);
  }
}
