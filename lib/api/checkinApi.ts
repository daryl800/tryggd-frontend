// lib/api/checkinApi.ts
import { tokenManager } from '../auth/tokenManager';

const EDGE_FUNCTION_URL = 'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-checkin-notifications';

export async function sendCheckinNotification(userId: string, checkinTime: string, timezone: string) {
    try {
        const token = await tokenManager.getValidToken();

        if (!token) {
            console.error('No valid token available');
            return { error: 'Not authenticated' };
        }

        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                checkin_time: checkinTime,
                timezone,
            }),
        });

        const data = await response.json();

        if (response.status === 401) {
            // Try one refresh
            const newToken = await tokenManager.refreshTokenNow();
            if (newToken) {
                return sendCheckinNotification(userId, checkinTime, timezone);
            }
        }

        return data;
    } catch (error) {
        console.error('Failed to send checkin notification:', error);
        return { error: 'Network error' };
    }
}