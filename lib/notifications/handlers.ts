// lib/notifications/handlers.ts
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

export async function setupNotificationHandler() {
    // ✅ Configure how notifications appear
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldPlaySound: true,      // Plays sound
            shouldSetBadge: true,
            shouldShowBanner: true,     // Shows banner (iOS specific)
            shouldShowList: true,       // Shows in notification center
        }),
    });

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.HIGH, // IMPORTANT
            lockscreenVisibility:
                Notifications.AndroidNotificationVisibility.PUBLIC,
        });
    }

    // Handle notification when app is in foreground
    Notifications.addNotificationReceivedListener(notification => {
        const data = notification.request.content.data;
        console.log('📱 Notification received in foreground:', {
            title: notification.request.content.title,
            type: data?.type,
            data: data
        });
    });

    // ✅ Handle notification tap - SINGLE SOURCE OF TRUTH
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data;
        console.log('👆 Notification tapped:', data?.type);

        try {
            // ✅ Clear badge when user taps any notification
            await Notifications.setBadgeCountAsync(0);
            console.log('✅ Badge cleared after tap');
        } catch (error) {
            console.log('ℹ️ Could not clear badge:', error);
        }

        // Handle navigation based on notification type
        handleNotificationNavigation(data);
    });

    // Store subscription for cleanup (optional, but good practice)
    return subscription;
}

// Helper function for clean navigation logic
function handleNotificationNavigation(data: any) {
    if (!data) {
        console.log('⚠️ No data in notification, defaulting to activity');
        router.push('/(tabs)/activity');
        return;
    }

    switch (data.type) {
        case 'contact_request':
            router.push('/(tabs)/contacts?tab=requests');
            console.log('→ Navigated to contact requests');
            break;

        case 'contact_accepted':
            router.push('/(tabs)/contacts?tab=contacts');
            console.log('→ Navigated to contacts list');
            break;

        case 'welfare_check':
            router.push('/(tabs)/activity');
            console.log('→ Navigated to activity from welfare check');
            break;

        case 'daily_reminder':
            router.push('/');
            console.log('→ Navigated to activity');
            break;

        case 'contact_checkin':
        case 'checkin_response':
            router.push('/(tabs)/activity');
            console.log('→ Default navigation to activity');
            break;

        default:
            // Default fallback for any other notification type
            if (data.type) {
                router.push('/(tabs)/activity');
                console.log('→ Default navigation to activity');
            }
            break;
    }
}
