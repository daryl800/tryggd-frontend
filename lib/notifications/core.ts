// lib/notifications/core.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const CONTACT_REQUEST_FUNCTION_URL =
    'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-contact-request';

// Storage keys
const STORAGE_KEYS = {
    CONTACT_CHECK_IN: '@settings_contact_check_in',
    WELFARE_SENT_CACHE: '@welfare_sent_cache',
};

// Check environment
export const IS_EXPO_GO = Constants.appOwnership === 'expo';

// In-memory welfare sent cache — populated on send and on async lookup hit,
// so subsequent renders can read the state synchronously without a flash.
const welfareSentMemoryCache = new Set<string>();
const welfareSentAtMemoryCache = new Map<string, string>();

export function hasCachedWelfareCheck(
    recipientUserId: string,
    senderUserId: string,
    checkinTime: string,
    welfareKind: 'today_check' | 'overdue_check'
): boolean {
    return welfareSentMemoryCache.has(`${recipientUserId}_${senderUserId}_${checkinTime}_${welfareKind}`);
}

export async function clearCachedWelfareCheck(
    recipientUserId: string,
    senderUserId: string,
    checkinTime: string,
    welfareKind: 'today_check' | 'overdue_check'
): Promise<void> {
    const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}_${welfareKind}`;
    welfareSentMemoryCache.delete(cacheKey);
    welfareSentAtMemoryCache.delete(cacheKey);

    const cached = await AsyncStorage.getItem(STORAGE_KEYS.WELFARE_SENT_CACHE);
    if (!cached) return;

    const parsed = JSON.parse(cached) as Record<string, boolean>;
    if (!(cacheKey in parsed)) return;

    delete parsed[cacheKey];
    await AsyncStorage.setItem(STORAGE_KEYS.WELFARE_SENT_CACHE, JSON.stringify(parsed));
}

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

        // Ensure this device token is owned by only one user row before upserting.
        const { error: cleanupError } = await supabase
            .from('user_push_tokens')
            .delete()
            .eq('expo_push_token', token)
            .neq('user_id', userId);

        if (cleanupError) {
            throw cleanupError;
        }

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
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
            console.error('❌ No valid session for contact request notification');
            return false;
        }

        const response = await fetch(CONTACT_REQUEST_FUNCTION_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                receiverUserId,
                senderUserId,
                senderName,
                senderEmail,
                requestId,
            }),
        });

        const result = await response.json();
        console.log('📥 Contact request push response:', {
            ok: response.ok,
            status: response.status,
            result,
        });

        if (!response.ok) {
            console.error('❌ Contact request notification failed:', result);
            return false;
        }

        console.log('✅ Contact request notification sent successfully');
        return true;

    } catch (error) {
        console.error('❌ Error sending contact request notification:', error);
        return false;
    }
}

export async function hasSentWelfareCheck(
    recipientUserId: string,
    senderUserId: string,
    checkinTime: string,
    welfareKind: 'today_check' | 'overdue_check'
): Promise<boolean> {
    try {
        const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}_${welfareKind}`;
        const cached = await AsyncStorage.getItem(STORAGE_KEYS.WELFARE_SENT_CACHE);
        if (cached) {
            const parsed = JSON.parse(cached) as Record<string, boolean>;
            if (parsed[cacheKey]) {
                return true;
            }
        }

        const { data, error } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', recipientUserId)
            .eq('sender_user_id', senderUserId)
            .eq('type', 'welfare_check')
            .filter('data->>checkinTime', 'eq', checkinTime)
            .filter('data->>welfareKind', 'eq', welfareKind)
            .limit(1);

        if (error) throw error;
        const hasSent = !!data && data.length > 0;
        if (hasSent) {
            await cacheWelfareCheckStatus(cacheKey);
        }
        return hasSent;
    } catch (error) {
        console.error('❌ Error checking welfare notification status:', error);
        return false;
    }
}

export async function getLastWelfareCheckSentAt(
    recipientUserId: string,
    senderUserId: string,
    checkinTime: string,
    welfareKind: 'today_check' | 'overdue_check'
): Promise<string | null> {
    try {
        const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}_${welfareKind}`;
        const cached = welfareSentAtMemoryCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const { data, error } = await supabase
            .from('notifications')
            .select('created_at')
            .eq('user_id', recipientUserId)
            .eq('sender_user_id', senderUserId)
            .eq('type', 'welfare_check')
            .filter('data->>checkinTime', 'eq', checkinTime)
            .filter('data->>welfareKind', 'eq', welfareKind)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        const sentAt = data?.created_at ?? null;
        if (sentAt) {
            welfareSentAtMemoryCache.set(cacheKey, sentAt);
        }
        return sentAt;
    } catch (error) {
        console.error('❌ Error fetching last welfare notification time:', error);
        return null;
    }
}

async function cacheWelfareCheckStatus(cacheKey: string): Promise<void> {
    welfareSentMemoryCache.add(cacheKey);
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.WELFARE_SENT_CACHE);
    const parsed = cached ? JSON.parse(cached) as Record<string, boolean> : {};
    parsed[cacheKey] = true;
    await AsyncStorage.setItem(STORAGE_KEYS.WELFARE_SENT_CACHE, JSON.stringify(parsed));
}

export async function sendWelfareCheckNotification({
    receiverUserId,
    senderUserId,
    senderName,
    checkinTime,
    welfareKind,
    cooldownHours,
}: {
    receiverUserId: string;
    senderUserId: string;
    senderName?: string;
    checkinTime: string;
    welfareKind: 'today_check' | 'overdue_check';
    cooldownHours?: number;
}): Promise<{ success: boolean; alreadySent?: boolean; error?: string }> {
    try {
        console.log('📤 Sending welfare check notification...', {
            receiverUserId,
            senderUserId,
            checkinTime,
            welfareKind,
            cooldownHours,
        });

        const cacheKey = `${receiverUserId}_${senderUserId}_${checkinTime}_${welfareKind}`;
        if (welfareKind === 'overdue_check' && typeof cooldownHours === 'number' && cooldownHours > 0) {
            const lastSentAt = await getLastWelfareCheckSentAt(receiverUserId, senderUserId, checkinTime, welfareKind);
            if (lastSentAt) {
                const cooldownMs = cooldownHours * 60 * 60 * 1000;
                const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
                if (elapsedMs < cooldownMs) {
                    console.log('⏩ Welfare check still in cooldown window');
                    return { success: true, alreadySent: true };
                }
            }
        } else {
            const alreadySent = await hasSentWelfareCheck(receiverUserId, senderUserId, checkinTime, welfareKind);
            if (alreadySent) {
                console.log('⏩ Welfare check already sent for this state/check-in');
                return { success: true, alreadySent: true };
            }
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        const response = await fetch(
            'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-welfare-check',
            {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                receiverUserId,
                senderUserId,
                senderName,
                checkinTime,
                welfareKind,
            }),
        });

        const result = await response.json();
        console.log('📥 Welfare Expo push response:', {
            ok: response.ok,
            status: response.status,
            result,
        });

        if (!response.ok) {
            console.error('❌ Expo push failed:', result);
            return { success: false, error: result?.error || 'Welfare check failed' };
        }

        await cacheWelfareCheckStatus(cacheKey);
        welfareSentAtMemoryCache.set(cacheKey, new Date().toISOString());

        console.log('✅ Welfare check notification sent successfully');
        return {
            success: true,
            alreadySent: result?.alreadySent === true,
        };
    } catch (error) {
        console.error('❌ Error sending welfare check notification:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown welfare notification error',
        };
    }
}
export async function sendEmergencyMessageNotification({
    receiverUserId,
    senderUserId,
    senderName,
    message,
}: {
    receiverUserId: string;
    senderUserId: string;
    senderName?: string;
    message: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        console.log('📤 Sending emergency message notification...', { receiverUserId, senderUserId });

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
            return { success: false, error: 'Not authenticated' };
        }

        const response = await fetch(
            'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-emergency-message',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    receiverUserId,
                    senderUserId,
                    senderName,
                    message,
                }),
            }
        );

        const result = await response.json();
        console.log('📥 Emergency message push response:', {
            ok: response.ok,
            status: response.status,
            result,
        });

        if (!response.ok) {
            console.error('❌ Emergency message failed:', result);
            return { success: false, error: result?.error || 'Emergency message failed' };
        }

        console.log('✅ Emergency message notification sent successfully');
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending emergency message notification:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown emergency message error',
        };
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
