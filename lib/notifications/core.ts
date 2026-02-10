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
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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

// Add to lib/notifications/core.ts
export async function sendContactRequestNotification({
    receiverUserId,
    senderUserId,
    senderName,
    senderEmail,
    requestId,
}: {
    receiverUserId: string;
    senderUserId: string;
    senderName: string;
    senderEmail: string;
    requestId: string;
}): Promise<boolean> {
    try {
        console.log('📤 Sending contact request notification...');

        // 1. Get receiver's push token from Supabase
        const { data: tokenData, error: tokenError } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token')
            .eq('user_id', receiverUserId)
            .single();

        if (tokenError || !tokenData?.expo_push_token) {
            console.log('❌ No push token found for receiver:', receiverUserId);
            return false;
        }

        // 2. Save notification to database for history
        const { error: dbError } = await supabase
            .from('notifications')
            .insert({
                user_id: receiverUserId,
                type: 'contact_request',
                title: '📩 Contact Request',
                body: `${senderName} wants to add you as a contact`,
                data: {
                    requestId,
                    senderUserId,
                    senderName,
                    senderEmail,
                    screen: 'contacts',
                    tab: 'requests'
                },
                sender_user_id: senderUserId,
                read: false
            });

        if (dbError) {
            console.error('❌ Error saving notification to DB:', dbError);
            // Continue anyway - try to send push
        }

        // 3. Send push notification via Expo
        const message = {
            to: tokenData.expo_push_token,
            sound: 'default',
            title: '📩 Contact Request',
            body: `${senderName} wants to add you as a contact`,
            data: {
                type: 'contact_request',
                requestId,
                senderUserId,
                senderName,
                senderEmail,
                screen: 'contacts',
                tab: 'requests'
            }
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('❌ Expo push failed:', result);
            return false;
        }

        console.log('✅ Contact request notification sent successfully');
        return true;

    } catch (error) {
        console.error('❌ Error sending contact request notification:', error);
        return false;
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
