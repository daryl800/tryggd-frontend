// lib/notifications/core.ts
import Constants from 'expo-constants';
import { Alert } from 'react-native';
import { supabase } from '../supabase';
import type { NotificationData } from './types';

// Check environment
export const IS_EXPO_GO = Constants.appOwnership === 'expo';
export const CAN_USE_PUSH_NOTIFICATIONS = !IS_EXPO_GO;

// Helper to check if string is a valid UUID
function isValidUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

// =========== MAIN NOTIFICATION FUNCTIONS ===========

/**
 * Main notification sender - automatically chooses the right method
 */
export async function sendNotification(notification: NotificationData): Promise<boolean> {
    console.log('📢 [Notification] Sending to:', notification.recipientUserId,
        'Type:', notification.type, 'Environment:', IS_EXPO_GO ? 'Expo Go' : 'Development Build');

    // Step 1: ALWAYS save to database first
    const saved = await saveNotificationToDatabase(notification);
    if (!saved) {
        console.warn('⚠️ Failed to save notification to database, but continuing...');
    }

    // Step 2: In Expo Go, just show alert immediately for contact requests
    if (IS_EXPO_GO) {
        console.log('📱 Expo Go: Showing alert immediately');
        showInAppAlertImmediately(notification);
        return true; // In Expo Go, we're done after showing alert
    }

    // Step 3: For Development Builds, try push notifications
    try {
        console.log('🚀 Development Build: Attempting push notification...');
        const pushSent = await sendPushNotification(notification);
        if (pushSent) {
            console.log('✅ Push notification sent successfully');
            return true;
        }
    } catch (error) {
        console.error('❌ Push notification failed:', error);
    }

    // Step 4: Fallback to local notification in Development Builds
    try {
        console.log('📱 Development Build: Attempting local notification...');
        const localSent = await sendLocalNotification(notification);
        if (localSent) {
            console.log('✅ Local notification handled');
            return true;
        }
    } catch (error) {
        console.error('❌ Local notification failed:', error);
    }

    // Step 5: Ultimate fallback - show alert
    console.log('⚠️ All notification methods failed, showing fallback alert');
    showInAppAlertImmediately(notification);
    return true;
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
    // Validate requestId is a UUID
    const validRequestId = isValidUUID(requestId) ? requestId : undefined;

    return sendNotification({
        type: 'contact_request',
        title: '📩 Ny kontaktförfrågan',
        body: `${senderName || senderEmail} vill lägga till dig som kontakt`,
        recipientUserId: receiverUserId,
        senderUserId: senderUserId,
        relatedId: validRequestId,
        data: {
            screen: 'contacts',
            tab: 'requests',
            requestId: requestId,
            senderName,
            senderEmail,
        },
    });
}

/**
 * Send contact accepted notification
 */
export async function sendContactAcceptedNotification({
    receiverUserId,
    senderUserId,
    senderName,
}: {
    receiverUserId: string;
    senderUserId: string;
    senderName: string;
}): Promise<boolean> {
    return sendNotification({
        type: 'contact_accepted',
        title: '✅ Kontaktförfrågan accepterad',
        body: `${senderName} har accepterat din kontaktförfrågan`,
        recipientUserId: receiverUserId,
        senderUserId: senderUserId,
        data: {
            screen: 'contacts',
            tab: 'contacts',
            senderName,
        },
    });
}

// =========== NOTIFICATION DELIVERY METHODS ===========

/**
 * Send push notification via Expo (only works in development builds)
 */
async function sendPushNotification(notification: NotificationData): Promise<boolean> {
    if (IS_EXPO_GO) {
        console.log('⏩ Skipping push notification in Expo Go');
        return false;
    }

    try {
        // Dynamic import to avoid loading expo-notifications in Expo Go
        const { default: Notifications } = await import('expo-notifications');

        // Get recipient's push token
        const { data: tokens, error } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token')
            .eq('user_id', notification.recipientUserId)
            .single();

        if (error) {
            console.log('❌ Error fetching push token:', error.message);
            throw new Error('No push token found');
        }

        if (!tokens?.expo_push_token) {
            console.log('❌ No push token registered for user:', notification.recipientUserId);
            throw new Error('No push token registered');
        }

        console.log('📤 Sending push to token:', tokens.expo_push_token.substring(0, 20) + '...');

        // Send to Expo push service
        const message = {
            to: tokens.expo_push_token,
            sound: 'default',
            title: notification.title,
            body: notification.body,
            data: {
                ...notification.data,
                type: notification.type,
                recipientUserId: notification.recipientUserId,
                senderUserId: notification.senderUserId,
                relatedId: notification.relatedId,
                timestamp: new Date().toISOString(),
            },
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

        const responseData = await response.json();

        if (!response.ok) {
            console.error('❌ Expo push service error:', responseData);
            throw new Error(`Push failed: ${responseData.errors?.[0]?.message || 'Unknown error'}`);
        }

        console.log('✅ Push notification sent via Expo');
        return true;
    } catch (error) {
        console.error('❌ Push notification failed:', error);
        return false;
    }
}

/**
 * Send local notification (works in Expo Go)
 */
async function sendLocalNotification(notification: NotificationData): Promise<boolean> {
    try {
        // Dynamic import to avoid immediate errors in Expo Go
        const { default: Notifications } = await import('expo-notifications');

        // First, check if we have permission
        const settings = await Notifications.getPermissionsAsync();
        if (!settings.granted && !settings.ios?.status === 0) {
            console.log('⏩ No notification permission, skipping local notification');
            return false;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title: notification.title,
                body: notification.body,
                data: {
                    ...notification.data,
                    type: notification.type,
                    isLocal: true,
                },
                sound: true,
            },
            trigger: null, // Show immediately
        });

        console.log('✅ Local notification scheduled');
        return true;
    } catch (error) {
        console.log('⚠️ Local notification failed, will use alert instead:', error);
        return false;
    }
}

// =========== ALERT FUNCTIONS ===========

/**
 * Show immediate in-app alert for important notifications
 */
/**
 * Show immediate in-app alert for important notifications
 */
function showInAppAlertImmediately(notification: NotificationData): void {
    // Use setTimeout to ensure it shows even if called during React render cycle
    setTimeout(() => {
        try {
            Alert.alert(
                notification.title,
                notification.body,
                [
                    {
                        text: 'Visa',
                        onPress: () => {
                            console.log('User tapped "Visa" on contact request alert');
                            // This will be handled by navigation in the app
                        }
                    },
                    {
                        text: 'Senare',
                        style: 'cancel',
                        onPress: () => {
                            console.log('User tapped "Senare"');
                        }
                    }
                ],
                {
                    cancelable: true,
                    onDismiss: () => {
                        console.log('User dismissed contact request alert');
                    }
                }
            );
            console.log('✅ Alert shown successfully');
        } catch (error) {
            console.error('❌ Failed to show alert:', error);
        }
    }, 100); // Small delay to ensure it appears
}

/**
 * Ultimate fallback - show simple alert
 */
function showFallbackAlert(notification: NotificationData): void {
    // Don't show alerts for system notifications
    if (notification.type === 'system') return;

    Alert.alert(
        notification.title,
        notification.body,
        [
            {
                text: 'OK',
                style: 'default',
            }
        ],
        { cancelable: true }
    );
}

// =========== DATABASE OPERATIONS ===========

/**
 * Save notification to database for history
 */
async function saveNotificationToDatabase(notification: NotificationData): Promise<boolean> {
    try {
        // Prepare the data to insert
        const insertData: any = {
            user_id: notification.recipientUserId,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            data: notification.data || {},
            sender_user_id: notification.senderUserId || null,
            read: false,
            delivery_method: CAN_USE_PUSH_NOTIFICATIONS ? 'push' : 'local',
            created_at: new Date().toISOString(),
        };

        // Only add related_id if it's a valid UUID
        if (notification.relatedId && isValidUUID(notification.relatedId)) {
            insertData.related_id = notification.relatedId;
        } else if (notification.relatedId) {
            console.log('⚠️ relatedId is not a valid UUID, storing in data instead:', notification.relatedId);
            // Store it in the data JSON field instead
            insertData.data = {
                ...insertData.data,
                originalRelatedId: notification.relatedId,
            };
        }

        const { error } = await supabase
            .from('notifications')
            .insert(insertData);

        if (error) {
            console.error('❌ Database save error:', error);
            return false;
        }

        console.log('💾 Notification saved to database');
        return true;
    } catch (error) {
        console.error('❌ Exception saving notification:', error);
        return false;
    }
}

/**
 * Get user's notifications from database
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

// =========== PUSH TOKEN MANAGEMENT ===========

/**
 * Register for push notifications (development builds only)
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    if (IS_EXPO_GO) {
        console.log('⏩ Push notifications disabled in Expo Go');
        return null;
    }

    try {
        // Dynamic imports
        const { default: Notifications } = await import('expo-notifications');
        const { default: Device } = await import('expo-device');
        const { Platform } = await import('react-native');

        // Check if device
        if (!Device.isDevice) {
            console.log('⏩ Must use physical device for push notifications');
            return null;
        }

        // Check permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            console.log('🔐 Requesting notification permission...');
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('❌ Permission not granted for push notifications');
            return null;
        }

        // Get push token
        console.log('🔑 Getting push token...');
        const token = (await Notifications.getExpoPushTokenAsync({
            projectId: '242a317f-a241-46dc-89ea-cd7857165cc1',
        })).data;

        console.log('✅ Push token obtained:', token.substring(0, 20) + '...');

        // Configure Android channel
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#5FA893',
                sound: 'default',
            });
        }

        return token;
    } catch (error) {
        console.error('❌ Error registering for push notifications:', error);
        return null;
    }
}

/**
 * Save push token to database
 */
export async function savePushToken(userId: string, token: string): Promise<boolean> {
    if (!token || IS_EXPO_GO) {
        console.log('⏩ Skipping token save (Expo Go or no token)');
        return false;
    }

    try {
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
            console.error('❌ Database save error:', error);
            return false;
        }

        console.log('✅ Push token saved for user:', userId);
        return true;
    } catch (error) {
        console.error('❌ Exception saving push token:', error);
        return false;
    }
}

/**
 * Check if user has push token
 */
export async function hasPushToken(userId: string): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token')
            .eq('user_id', userId)
            .single();

        if (error || !data?.expo_push_token) {
            return false;
        }

        return true;
    } catch (error) {
        console.error('❌ Error checking push token:', error);
        return false;
    }
}

// NO DUPLICATE EXPORTS - Only export what's needed
// The functions marked with "export" above are already exported