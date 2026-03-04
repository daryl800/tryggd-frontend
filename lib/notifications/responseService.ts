// lib/notifications/responseService.ts

import { tokenManager } from '../auth/tokenManager';
import { supabase } from '../supabase';

const EDGE_FUNCTION_URL = 'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-checkin-response';

interface CheckinRequest {
    recipientUserId: string;
    senderUserId: string;
    checkinTime: string;
}

class ResponseNotificationService {
    async sendResponse({ recipientUserId, senderUserId, checkinTime }: CheckinRequest, retryCount = 0): Promise<{ success: boolean; data?: any; error?: any }> {
        const MAX_RETRIES = 2;
        try {
            // Get the user's JWT token (exactly like working function)
            const token = await tokenManager.getValidToken();

            if (!token) {
                console.error('❌ No valid token available');
                return { success: false, error: 'Not authenticated' };
            }

            const requestBody = {
                recipientUserId,
                senderUserId,
                checkinTime,
                timestamp: new Date().toISOString(),
            };

            console.log('📤 Sending to Edge Function:', requestBody);

            // Send with JWT token (gateway will now let it through)
            const response = await fetch(EDGE_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            const responseText = await response.text();
            console.log('📥 Response:', { status: response.status, body: responseText });

            let data;
            try {
                data = JSON.parse(responseText);
            } catch {
                data = { raw: responseText };
            }

            if (!response.ok && response.status === 401 && retryCount < MAX_RETRIES) {
                console.log(`🔄 Token expired, refreshing (attempt ${retryCount + 1})...`);
                const newToken = await tokenManager.refreshTokenNow();
                if (newToken) {
                    return this.sendResponse({ recipientUserId, senderUserId, checkinTime }, retryCount + 1);
                }
            }

            return { success: true, data };

        } catch (error) {
            console.error('❌ Error sending response:', error);
            return { success: false, error };
        }
    }

    async hasResponded(recipientUserId: string, senderUserId: string, checkinTime: string) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', recipientUserId)
                .eq('sender_user_id', senderUserId)
                .eq('type', 'checkin_response')
                .filter('data->>checkinTime', 'eq', checkinTime)
                .maybeSingle();

            if (error) {
                console.error('Error checking response:', error);
                return false;
            }

            return !!data;
        } catch (error) {
            console.error('Error in hasResponded:', error);
            return false;
        }
    }
}

export const responseService = new ResponseNotificationService();