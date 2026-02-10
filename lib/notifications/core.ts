// lib/notifications/core.ts
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

// Check environment
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

/**
 * Register for push notifications and save token to Supabase
 */
export async function registerAndSavePushToken(userId: string): Promise<boolean> {
    try {
        // Check if running on a real device
        if (!Device.isDevice) {
            console.log('⏩ Must use physical device for push notifications');
            return false;
        }

        // Get existing permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        // If not granted, request permissions
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        // If still not granted, return false
        if (finalStatus !== 'granted') {
            console.log('❌ Push notification permission not granted');
            return false;
        }

        // Get the Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;
        console.log('✅ Expo Push Token obtained');

        // Android-specific channel setup
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#5FA893',
            });
        }

        // Save token to Supabase
        const { error } = await supabase
            .from('user_push_tokens')
            .upsert({
                user_id: userId,
                expo_push_token: token,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id',
            });

        if (error) {
            console.error('❌ Error saving push token:', error);
            return false;
        }

        console.log('✅ Push token saved to Supabase');
        return true;
    } catch (err) {
        console.error('❌ Error registering for push notifications:', err);
        return false;
    }
}

/**
 * Get user's notification history from database
 */
export async function getUserNotifications(userId: string, limit = 20) {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }

        return data || [];
    } catch (error) {
        console.error('❌ Error getting notifications:', error);
        return [];
    }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({
                read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', notificationId);

        if (error) {
            console.error('❌ Database update error:', error);
            throw error;
        }

        return true;
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        return false;
    }
}