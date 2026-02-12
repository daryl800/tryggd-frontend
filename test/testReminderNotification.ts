import * as Notifications from 'expo-notifications';

import { Platform } from 'react-native';

export async function testReminderInOneMinute() {
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
            minute: 46,
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

    console.log('✅ TEST reminder scheduled at xx:00 every day. ID:', newId);
}