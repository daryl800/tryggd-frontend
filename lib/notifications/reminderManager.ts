// reminderManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const STORAGE_KEY = 'selfReminderEnabled';
const REMINDER_TIME_CACHE_KEY = 'cachedReminderTime';

// Default reminder time if Supabase fetch fails
const DEFAULT_REMINDER_HOUR = 15;
const DEFAULT_REMINDER_MINUTE = 0;

/**
 * Fetch reminder time from Supabase
 */
export async function fetchReminderTime(): Promise<{ hour: number; minute: number }> {
    try {
        // You'll need to create this table in Supabase first
        // Suggested schema: settings(id, key, hour, minute)
        const { data, error } = await supabase
            .from('reminder_settings')
            .select('hour, minute')
            .eq('key', 'daily_reminder')
            .single();

        if (error) throw error;

        if (data) {
            const reminderTime = {
                hour: data.hour || DEFAULT_REMINDER_HOUR,
                minute: data.minute || DEFAULT_REMINDER_MINUTE
            };

            // Cache the fetched time
            await AsyncStorage.setItem(REMINDER_TIME_CACHE_KEY, JSON.stringify(reminderTime));

            return reminderTime;
        }
    } catch (error) {
        console.error('Error fetching reminder time from Supabase:', error);
    }

    // Try to get cached time
    try {
        const cached = await AsyncStorage.getItem(REMINDER_TIME_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (cacheError) {
        console.error('Error reading cached reminder time:', cacheError);
    }

    // Return default time if all else fails
    return { hour: DEFAULT_REMINDER_HOUR, minute: DEFAULT_REMINDER_MINUTE };
}

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
 * Schedule daily reminder with time from Supabase
 */
export async function scheduleDailyReminder() {
    await Notifications.cancelAllScheduledNotificationsAsync();

    // Set up Android channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
            name: 'Daily Reminders',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            sound: 'default',
        });
    }

    // Fetch reminder time from Supabase
    const { hour, minute } = await fetchReminderTime();
    console.log(`📅 Scheduling reminder for ${hour}:${minute.toString().padStart(2, '0')}`);

    let trigger: Notifications.SchedulableNotificationTriggerInput;

    if (Platform.OS === 'ios') {
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour,
            minute,
            repeats: true,
        };
    } else {
        // Android
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        };
    }

    const newId = await Notifications.scheduleNotificationAsync({
        content: {
            title: '⏰ Check-in Reminder',
            body: "Don't forget to check in today.",
            data: { type: 'self_reminder' },
            ...(Platform.OS === 'android' && {
                priority: Notifications.AndroidNotificationPriority.HIGH,
                sound: 'default',
            }),
        },
        trigger,
    });

    console.log(`✅ Daily reminder scheduled at ${hour}:${minute.toString().padStart(2, '0')} every day. ID:`, newId);
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

/**
 * Refresh reminder schedule with latest time from Supabase
 * Call this when app becomes active or returns from background
 */
export async function refreshReminderSchedule() {
    const enabled = await isSelfReminderEnabled();
    if (!enabled) return;

    console.log('🔄 Refreshing reminder schedule...');
    await scheduleDailyReminder();
}