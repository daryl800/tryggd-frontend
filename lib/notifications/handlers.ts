// lib/notifications/handler.ts
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

// Configure how notifications are presented
export function setupNotificationHandler() {
    // Step 1: Configure notification presentation
    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            console.log('📱 Notification received in foreground:', notification.request.content.title);

            return {
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
            };
        },
    });

    // Step 2: Handle notification when app is in foreground
    // This doesn't affect sending, just handles display
    Notifications.addNotificationReceivedListener(notification => {
        const data = notification.request.content.data;
        console.log('🔔 Notification received:', {
            type: data?.type,
            title: notification.request.content.title,
            fromForeground: true,
        });

        // You can trigger local state updates here if needed
        // For example, refresh contacts or check-ins
    });

    // Step 3: Handle notification taps (when user taps notification)
    Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        console.log('👆 User tapped notification:', data?.type);

        // Navigate based on notification type
        handleNotificationNavigation(data);
    });
}

// Navigation handler
function handleNotificationNavigation(data: any) {
    if (!data) return;

    const { type, screen, tab, requestId, senderUserId } = data;

    switch (type) {
        case 'contact_request':
            // Navigate to contact requests tab
            router.push({
                pathname: '/(tabs)/contacts',
                params: { tab: 'requests' }
            });
            break;

        case 'contact_accepted':
            // Navigate to contacts list
            router.push({
                pathname: '/(tabs)/contacts',
                params: { tab: 'contacts' }
            });
            break;

        case 'contact_checkin':
            // Navigate to activity tab
            router.push('/(tabs)/activity');
            break;

        case 'self_reminder':
        case 'target_reminder':
            // Navigate to check-in screen
            router.push('/(tabs)/checkin');
            break;

        default:
            // Default to activity screen
            router.push('/(tabs)/activity');
            break;
    }
}