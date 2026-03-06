// lib/notifications/responseService.ts

import { tokenManager } from "../auth/tokenManager";
import { supabase } from "../supabase";

const EDGE_FUNCTION_URL = 'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-checkin-response';

class ResponseNotificationService {
    private responseCache = new Map<string, boolean>();
    private notificationIdCache = new Map<string, string>();
    private pendingRequests = new Map<string, Promise<boolean>>(); // ← NEW: deduplicate requests

    // ============================================
    // NEW METHOD: Synchronous cache check
    // ============================================
    hasCachedResponse(cacheKey: string): boolean {
        return this.responseCache.has(cacheKey);
    }


    async sendResponse({
        recipientUserId,
        senderUserId,
        checkinTime,
    }: {
        recipientUserId: string;
        senderUserId: string;
        checkinTime: string;
    }) {
        try {
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

            if (!response.ok) {
                return { success: false, error: { status: response.status, data } };
            }

            // Cache the successful response
            const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}`;
            this.responseCache.set(cacheKey, true);
            if (data.notificationId) {
                this.notificationIdCache.set(cacheKey, data.notificationId);
            }

            return { success: true, data };

        } catch (error) {
            console.error('❌ Error sending response:', error);
            return { success: false, error };
        }
    }

    async hasResponded(recipientUserId: string, senderUserId: string, checkinTime: string): Promise<boolean> {
        const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}`;

        // Check cache first
        if (this.responseCache.has(cacheKey)) {
            console.log('📦 Using cached response status: true');
            return true;
        }

        // Check pending requests
        if (this.pendingRequests.has(cacheKey)) {
            console.log('⏳ Waiting for pending request...');
            return this.pendingRequests.get(cacheKey)!;
        }

        // Start query and store promise
        const promise = this.queryDatabase(recipientUserId, senderUserId, checkinTime, cacheKey);
        this.pendingRequests.set(cacheKey, promise);

        const result = await promise;
        this.pendingRequests.delete(cacheKey);

        return result;
    }

    private async queryDatabase(
        recipientUserId: string,
        senderUserId: string,
        checkinTime: string,
        cacheKey: string
    ): Promise<boolean> {
        try {
            // Get the correct timezone
            const { data: checkinData } = await supabase
                .from('users_latest_checkin')
                .select('checkin_timezone')
                .eq('user_id', recipientUserId)
                .maybeSingle();

            const { data: userSettings } = await supabase
                .from('user_settings')
                .select('timezone')
                .eq('user_id', recipientUserId)
                .maybeSingle();

            const timezone = checkinData?.checkin_timezone ||
                userSettings?.timezone ||
                'Europe/Stockholm';

            const localTimeStr = new Date(checkinTime).toLocaleString('en-GB', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: timezone
            });

            console.log('🔍 Database check:', {
                recipient: recipientUserId,
                sender: senderUserId,
                iso: checkinTime,
                local: localTimeStr,
                timezone
            });

            // Run queries in parallel with Promise.all
            const [byIsoResult, byLocalResult] = await Promise.all([
                supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', recipientUserId)
                    .eq('sender_user_id', senderUserId)
                    .eq('type', 'checkin_response')
                    .filter('data->>checkinTime', 'eq', checkinTime),

                supabase
                    .from('notifications')
                    .select('id')
                    .eq('user_id', recipientUserId)
                    .eq('sender_user_id', senderUserId)
                    .eq('type', 'checkin_response')
                    .filter('data->>checkinTimeLocal', 'eq', localTimeStr)
            ]);

            const allMatches = [
                ...(byIsoResult.data || []),
                ...(byLocalResult.data || [])
            ];

            const hasResponse = allMatches.length > 0;

            if (hasResponse) {
                console.log('✅ Found response in database');
                this.responseCache.set(cacheKey, true);
            } else {
                console.log('❌ No response found in database');

                // Optional: Cache negative results briefly to prevent repeated checks
                // setTimeout(() => this.responseCache.delete(cacheKey), 5000);
            }

            return hasResponse;

        } catch (error) {
            console.error('❌ Error in queryDatabase:', error);
            return false;
        }
    }

    // Call this on logout to clear cache
    clearCache() {
        this.responseCache.clear();
        this.notificationIdCache.clear();
        this.pendingRequests.clear(); // Clear pending requests too
    }
}

export const responseService = new ResponseNotificationService();