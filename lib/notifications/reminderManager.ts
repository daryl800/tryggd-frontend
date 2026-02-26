// lib/notifications/reminderManager.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const STORAGE_KEY = 'selfReminderEnabled';

/**
 * Enable reminder toggle
 */
export async function enableSelfReminder() {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');

    // Save preference to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                reminder_enabled: true,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
    }
}

/**
 * Disable reminder toggle
 */
export async function disableSelfReminder() {
    await AsyncStorage.setItem(STORAGE_KEY, 'false');

    // Save preference to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                reminder_enabled: false
            });
    }
}

/**
 * Check if reminder enabled
 */
export async function isSelfReminderEnabled(): Promise<boolean> {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v === 'true';
}

/**
 * Call after successful check-in
 */
export async function cancelTodayReminderAfterCheckin() {
    // Nothing to do locally!
    // The server already knows you checked in
    console.log('✅ Check-in recorded, server will handle reminders');
}