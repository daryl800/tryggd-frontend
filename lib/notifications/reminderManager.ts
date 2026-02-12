// reminderManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'selfReminderEnabled';

/**
 * Enable reminder toggle
 */
export async function enableSelfReminder() {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    await scheduleDailyReminder();
}

/**
 * Disable reminder toggle
 */
export async function disableSelfReminder() {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');
    await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Check if reminder enabled
 */
export async function isSelfReminderEnabled(): Promise<boolean> {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v === 'true';
}

/**
 * Schedule daily 15:00 reminder
 */
import { Platform } from 'react-native'; // ← ADD THIS LINE


// ... (your enableSelfReminder, disableSelfReminder, isSelfReminderEnabled functions remain the same)

export async function scheduleDailyReminder() {
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Optional but recommended: Set up a channel on Android (do this once, e.g. in App.tsx)
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
            name: 'Daily Reminders',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default', // or your custom sound
        });
    }

    let trigger: Notifications.SchedulableNotificationTriggerInput;

    if (Platform.OS === 'ios') {
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: 15,
            minute: 0,
            repeats: true,
        };
    } else {
        // Android
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 16,
            minute: 41,
            // channelId: 'reminders', // optional, links to the channel above
        };
    }

    const newId = await Notifications.scheduleNotificationAsync({
        content: {
            title: '⏰ Check-in Reminder',
            body: "Don't forget to check in today.",
            data: { type: 'self_reminder' },
            // Optional: Android-specific priority/sound
            ...(Platform.OS === 'android' && {
                priority: Notifications.AndroidNotificationPriority.HIGH,
                sound: 'default',
            }),
        },
        trigger,
    });

    console.log('✅ Daily reminder scheduled at 15:00 every day. ID:', newId);
}

/**
 * Call after successful check-in
 */
export async function cancelTodayReminderAfterCheckin() {
    const enabled = await isSelfReminderEnabled();
    if (!enabled) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    await scheduleDailyReminder(); // schedule tomorrow again
}
