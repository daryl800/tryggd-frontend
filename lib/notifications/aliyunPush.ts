import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Native module only exists in production/dev-client builds — not in Expo Go.
let ExpoAliyunPush: any = null;
try {
  ExpoAliyunPush = require('expo-aliyun-push').default;
} catch {
  // silently unavailable
}

export async function initAliyunPushForUser(userId: string): Promise<void> {
    if (IS_EXPO_GO || !Device.isDevice || !ExpoAliyunPush) return;

    try {
        await ExpoAliyunPush.initAliyunPush();

        if (Platform.OS === 'android') {
            await ExpoAliyunPush.initThirdPush();
        }

        const deviceId = await ExpoAliyunPush.getDeviceId();

        await ExpoAliyunPush.bindAccount(userId);

        await supabase
            .from('user_push_tokens')
            .upsert(
                { user_id: userId, aliyun_device_id: deviceId, updated_at: new Date().toISOString() },
                { onConflict: 'user_id' }
            );

        console.log('✅ Aliyun Push initialized, device bound:', deviceId);
    } catch (error) {
        console.error('⚠️ Aliyun Push init error:', error);
    }
}

export async function unbindAliyunAccount(): Promise<void> {
    if (IS_EXPO_GO || !Device.isDevice || !ExpoAliyunPush) return;

    try {
        await ExpoAliyunPush.unbindAccount();
    } catch (error) {
        console.error('⚠️ Aliyun Push unbind error:', error);
    }
}
