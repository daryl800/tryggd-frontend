// lib/notifications/core.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

// Storage keys
const STORAGE_KEYS = {
    CONTACT_CHECK_IN: '@settings_contact_check_in',
};

// Check environment
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

/**
 * Register for push notifications and save token + preferences to Supabase
 */
// In lib/notifications/core.ts - update registerAndSavePushToken
export async function registerAndSavePushToken(userId: string): Promise<boolean> {
    try {
        // Check if running on a real device
        if (!Device.isDevice) {
            console.log('⏩ Must use physical device for push notifications');
            return false;
        }

        const projectId =
            Constants?.expoConfig?.extra?.eas?.projectId ??
            Constants?.easConfig?.projectId;

        if (!projectId) {
            console.log('❌ Expo project ID not found for push token registration');
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
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenData.data;
        console.log('✅ Expo Push Token obtained');

        // ✅ SAVE TO ASYNC STORAGE
        await AsyncStorage.setItem('@expo_push_token', token);

        // Android-specific channel setup
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#5FA893',
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            });

            // Add channel for contact check-ins
            await Notifications.setNotificationChannelAsync('contact-checkins', {
                name: 'Contact Check-ins',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#5FA893',
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            });
        }

        // Get notification preference from AsyncStorage
        const contactCheckInPref = await AsyncStorage.getItem(STORAGE_KEYS.CONTACT_CHECK_IN);
        const isEnabled = contactCheckInPref !== 'false'; // default to true

        // Save to user_push_tokens table
        const { error } = await supabase
            .from('user_push_tokens')
            .upsert({
                user_id: userId,
                expo_push_token: token,
                contact_checkin_notifications: isEnabled,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id'
            });

        if (error) throw error;

        console.log('✅ Push token and preferences saved to user_push_tokens');
        return true;
    } catch (err) {
        console.error('❌ Error registering for push notifications:', err);
        return false;
    }
}

/**
 * Sync notification preferences from AsyncStorage to Supabase
 */
export async function syncNotificationPreferences(userId: string): Promise<boolean> {
    try {
        // Get preferences from AsyncStorage
        const contactCheckInPref = await AsyncStorage.getItem(STORAGE_KEYS.CONTACT_CHECK_IN);
        const isEnabled = contactCheckInPref !== 'false';

        // Update user_push_tokens table
        const { error } = await supabase
            .from('user_push_tokens')
            .update({
                contact_checkin_notifications: isEnabled,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

        if (error) {
            console.error('❌ Error syncing preferences:', error);
            return false;
        }

        console.log('✅ Notification preferences synced to Supabase');
        return true;
    } catch (error) {
        console.error('❌ Error syncing notification preferences:', error);
        return false;
    }
}

/**
 * Update contact check-in notification preference
 * Call this from your Settings screen when toggling
 */
export async function updateContactCheckInPreference(enabled: boolean): Promise<boolean> {
    try {
        // Save to AsyncStorage first
        await AsyncStorage.setItem(STORAGE_KEYS.CONTACT_CHECK_IN, enabled.toString());

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            console.log('⏩ No user logged in, preference saved locally only');
            return true;
        }

        // Update user_push_tokens table
        const { error } = await supabase
            .from('user_push_tokens')
            .update({
                contact_checkin_notifications: enabled,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);

        if (error) {
            console.error('❌ Error updating preference in Supabase:', error);
            return false;
        }

        console.log(`✅ Contact check-in notifications ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    } catch (error) {
        console.error('❌ Error updating contact check-in preference:', error);
        return false;
    }
}

/**
 * Get user's profile by ID
 */
export async function getUserProfile(userId: string) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error getting user profile:', error);
        return null;
    }
}

/**
 * Get user's push token and preferences
 */
export async function getUserPushSettings(userId: string) {
    try {
        const { data, error } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token, contact_checkin_notifications')
            .eq('user_id', userId)
            .maybeSingle(); // Use maybeSingle to handle no rows case

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Error getting user push settings:', error);
        return null;
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
 * Send contact request notification
 */
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

        // 1. Check if receiver wants notifications
        const { data: tokenData, error: tokenError } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token, contact_checkin_notifications')
            .eq('user_id', receiverUserId)
            .maybeSingle();

        if (tokenError) throw tokenError;

        // Skip if no token or notifications disabled
        if (!tokenData?.expo_push_token) {
            console.log('⏩ No push token found for receiver:', receiverUserId);
            return false;
        }

        if (tokenData.contact_checkin_notifications === false) {
            console.log('⏩ Receiver has disabled contact notifications');
            return false;
        }

        // 2. Get sender's profile for display name
        const { data: senderProfile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', senderUserId)
            .maybeSingle();

        const displayName = senderProfile?.display_name || senderName || senderEmail.split('@')[0];

        // 3. Save notification to database for history
        const { error: dbError } = await supabase
            .from('notifications')
            .insert({
                user_id: receiverUserId,
                type: 'contact_request',
                title: '📩 Contact Request',
                body: `${displayName} wants to add you as a contact`,
                data: {
                    requestId,
                    senderUserId,
                    senderName: displayName,
                    senderEmail,
                    senderAvatar: senderProfile?.avatar_url,
                    screen: 'contacts',
                    tab: 'requests'
                },
                sender_user_id: senderUserId,
                read: false,
                created_at: new Date().toISOString()
            });

        if (dbError) {
            console.error('❌ Error saving notification to DB:', dbError);
            // Continue anyway - try to send push
        }

        // 4. Send push notification via Expo
        const message = {
            to: tokenData.expo_push_token,
            sound: 'default',
            title: '📩 Contact Request',
            body: `${displayName} wants to add you as a contact`,
            data: {
                type: 'contact_request',
                requestId,
                senderUserId,
                senderName: displayName,
                senderEmail,
                senderAvatar: senderProfile?.avatar_url,
                screen: 'contacts',
                tab: 'requests'
            },
            channelId: 'default',
            priority: 'high' as const,
        };

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('❌ Expo push failed:', result);
            return false;
        }

        // ✅ Check for DeviceNotRegistered error in the response
        if (result.data && Array.isArray(result.data)) {
            for (const receipt of result.data) {
                if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
                    console.log('📱 Device not registered, cleaning up token for user:', receiverUserId);

                    // Clear the invalid token from your database
                    const { error: updateError } = await supabase
                        .from('user_push_tokens')
                        .update({
                            expo_push_token: null,
                            updated_at: new Date().toISOString()
                        })
                        .eq('user_id', receiverUserId);

                    if (updateError) {
                        console.error('❌ Error cleaning up invalid token:', updateError);
                    } else {
                        console.log('✅ Invalid token cleaned up for user:', receiverUserId);
                    }

                    // Still return false since notification wasn't delivered
                    return false;
                }
            }
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

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({
                read: true,
                read_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) {
            console.error('❌ Database update error:', error);
            throw error;
        }

        return true;
    } catch (error) {
        console.error('❌ Error marking all notifications as read:', error);
        return false;
    }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }

        return count || 0;
    } catch (error) {
        console.error('❌ Error getting unread count:', error);
        return 0;
    }
}

/**
 * Delete a notification
 */
export async function deleteNotification(notificationId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);

        if (error) {
            console.error('❌ Database delete error:', error);
            throw error;
        }

        return true;
    } catch (error) {
        console.error('❌ Error deleting notification:', error);
        return false;
    }
}

/**
 * Clear push tokens for a user (call on logout)
 */
export async function clearPushTokens(userId: string): Promise<boolean> {
    try {
        // Delete the token record instead of updating to null
        const { error } = await supabase
            .from('user_push_tokens')
            .delete()
            .eq('user_id', userId);

        if (error) {
            console.error('❌ Error clearing push token:', error);
            return false;
        }

        console.log('✅ Push tokens cleared for user');
        return true;
    } catch (error) {
        console.error('❌ Error clearing push tokens:', error);
        return false;
    }
}
