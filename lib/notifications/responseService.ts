// lib/notifications/responseService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenManager } from "../auth/tokenManager";
import { supabase } from "../supabase";

const EDGE_FUNCTION_URL = 'https://ygfmosuqclefhhbovghn.supabase.co/functions/v1/send-checkin-response';

const RESPONSES_CACHE_KEY = 'cached_responses';
const RESPONSE_STATUS_KEY = 'response_status_cache'; // New: for boolean status cache
const LAST_FETCH_KEY = 'last_responses_fetch';

class ResponseNotificationService {
    private responseCache = new Map<string, boolean>();
    private notificationIdCache = new Map<string, string>();
    private pendingRequests = new Map<string, Promise<boolean>>();
    private initialized = false;

    // ============================================
    // Initialize service - load cached statuses
    // ============================================
    async initialize() {
        if (this.initialized) return;

        try {
            // Load response status cache
            const cachedStatuses = await AsyncStorage.getItem(RESPONSE_STATUS_KEY);
            if (cachedStatuses) {
                const parsed = JSON.parse(cachedStatuses);
                this.responseCache = new Map(Object.entries(parsed));
                console.log(`✅ Loaded ${this.responseCache.size} cached response statuses`);
            }

            this.initialized = true;
        } catch (error) {
            console.error('Error initializing response service:', error);
        }
    }

    // ============================================
    // Persist response status cache
    // ============================================
    private async persistResponseCache() {
        try {
            const obj = Object.fromEntries(this.responseCache);
            await AsyncStorage.setItem(RESPONSE_STATUS_KEY, JSON.stringify(obj));
        } catch (error) {
            console.error('Error persisting response cache:', error);
        }
    }

    // ============================================
    // Load responses from AsyncStorage
    // ============================================
    async loadCachedResponses(): Promise<any[]> {
        try {
            const cached = await AsyncStorage.getItem(RESPONSES_CACHE_KEY);
            return cached ? JSON.parse(cached) : [];
        } catch (error) {
            console.error('Error loading cached responses:', error);
            return [];
        }
    }

    // ============================================
    // Save responses to AsyncStorage
    // ============================================
    async saveResponsesToCache(responses: any[]) {
        try {
            await AsyncStorage.setItem(RESPONSES_CACHE_KEY, JSON.stringify(responses));
            await AsyncStorage.setItem(LAST_FETCH_KEY, Date.now().toString());
        } catch (error) {
            console.error('Error saving responses to cache:', error);
        }
    }

    // ============================================
    // Check memory cache
    // ============================================
    hasCachedResponse(cacheKey: string): boolean {
        return this.responseCache.has(cacheKey);
    }

    // ============================================
    // Get responses (cache-first)
    // ============================================
    async getResponses(userId: string, forceRefresh = false): Promise<any[]> {
        await this.initialize();

        const cached = await this.loadCachedResponses();

        const lastFetch = await AsyncStorage.getItem(LAST_FETCH_KEY);
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        const shouldRefresh =
            forceRefresh ||
            !lastFetch ||
            parseInt(lastFetch) < fiveMinutesAgo;

        if (shouldRefresh) {
            this.fetchResponsesFromDB(userId).catch(console.error);
        }

        return cached;
    }

    // ============================================
    // Fetch fresh responses from database
    // ============================================
    async fetchResponsesFromDB(userId: string): Promise<any[]> {
        try {
            console.log('📡 Fetching fresh responses from database...');

            const { data: responses, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .eq('type', 'checkin_response')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!responses || responses.length === 0) {
                console.log('📡 No responses found');
                return [];
            }

            const senderIds = [
                ...new Set(
                    responses
                        .map(r => r.sender_user_id)
                        .filter(Boolean)
                )
            ];

            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url')
                .in('id', senderIds);

            const profileMap = new Map<string, any>();
            profiles?.forEach(p => profileMap.set(p.id, p));

            const formattedResponses = responses.map(r => ({
                ...r,
                senderName:
                    profileMap.get(r.sender_user_id)?.display_name ||
                    r.data?.senderName ||
                    'Someone'
            }));

            await this.saveResponsesToCache(formattedResponses);

            console.log(`✅ Fetched ${formattedResponses.length} responses from DB`);

            return formattedResponses;

        } catch (error) {
            console.error('Error fetching fresh responses:', error);
            return [];
        }
    }

    // ============================================
    // Group responses by check-in time
    // ============================================
    groupResponsesByCheckin(responses: any[]): Map<string, any[]> {
        const grouped = new Map<string, any[]>();

        responses.forEach(response => {
            const checkinTime = response.data?.checkinTime;

            if (checkinTime) {
                if (!grouped.has(checkinTime)) {
                    grouped.set(checkinTime, []);
                }

                grouped.get(checkinTime)!.push(response);
            }
        });

        return grouped;
    }

    // ============================================
    // Send response
    // ============================================
    async sendResponse({
        recipientUserId,
        senderUserId,
        checkinTime,
        responseKind = 'like',
    }: {
        recipientUserId: string;
        senderUserId: string;
        checkinTime: string;
        responseKind?: 'like' | 'support';
    }) {
        try {
            await this.initialize();

            const token = await tokenManager.getValidToken();

            if (!token) {
                console.error('❌ No valid token available');
                return { success: false, error: 'Not authenticated' };
            }

            const requestBody = {
                recipientUserId,
                senderUserId,
                checkinTime,
                responseKind,
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

            console.log('📥 Response:', {
                status: response.status,
                body: responseText
            });

            let data;

            try {
                data = JSON.parse(responseText);
            } catch {
                data = { raw: responseText };
            }

            if (!response.ok) {
                return { success: false, error: { status: response.status, data } };
            }

            const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}`;

            // Update both memory cache and AsyncStorage
            this.responseCache.set(cacheKey, true);
            await this.persistResponseCache();

            if (data.notificationId) {
                this.notificationIdCache.set(cacheKey, data.notificationId);
            }

            // Update AsyncStorage cache
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('display_name')
                    .eq('id', senderUserId)
                    .single();

                const newResponse = {
                    id: data.notificationId,
                    user_id: recipientUserId,
                    sender_user_id: senderUserId,
                    type: 'checkin_response',
                    body: responseKind === 'support'
                        ? `💪 ${profile?.display_name || 'Someone'} sent you support`
                        : `👍 ${profile?.display_name || 'Someone'} sent you a like`,
                    created_at: new Date().toISOString(),
                    data: {
                        senderName: profile?.display_name || 'Someone',
                        checkinTime,
                        checkinTimeLocal: new Date(checkinTime).toLocaleString('en-GB', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })
                    },
                    sender: {
                        display_name: profile?.display_name || 'Someone'
                    },
                    senderName: profile?.display_name || 'Someone'
                };

                const cached = (await this.loadCachedResponses()) ?? [];

                cached.unshift(newResponse);

                await this.saveResponsesToCache(cached);

                console.log('✅ Updated AsyncStorage cache with new response');

            } catch (cacheError) {
                console.error('Error updating cache:', cacheError);
            }

            return { success: true, data };

        } catch (error) {
            console.error('❌ Error sending response:', error);
            return { success: false, error };
        }
    }

    // ============================================
    // Check if user has responded
    // ============================================
    async hasResponded(
        recipientUserId: string,
        senderUserId: string,
        checkinTime: string
    ): Promise<boolean> {
        await this.initialize();

        const cacheKey = `${recipientUserId}_${senderUserId}_${checkinTime}`;

        // Check memory cache first (fastest)
        if (this.responseCache.has(cacheKey)) {
            console.log('📦 Using cached response status: true');
            return true;
        }

        // Check if there's already a pending request for this key
        if (this.pendingRequests.has(cacheKey)) {
            console.log('⏳ Waiting for pending request...');
            return this.pendingRequests.get(cacheKey)!;
        }

        // Create a new request
        const promise = this.queryDatabase(
            recipientUserId,
            senderUserId,
            checkinTime,
            cacheKey
        );

        this.pendingRequests.set(cacheKey, promise);

        const result = await promise;

        this.pendingRequests.delete(cacheKey);

        return result;
    }

    // ============================================
    // Database query
    // ============================================
    private async queryDatabase(
        recipientUserId: string,
        senderUserId: string,
        checkinTime: string,
        cacheKey: string
    ): Promise<boolean> {

        try {
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

            const timezone =
                checkinData?.checkin_timezone ||
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
                // Cache the result in both memory and AsyncStorage
                this.responseCache.set(cacheKey, true);
                await this.persistResponseCache();
            } else {
                console.log('❌ No response found in database');
            }

            return hasResponse;

        } catch (error) {
            console.error('❌ Error in queryDatabase:', error);
            return false;
        }
    }

    // ============================================
    // Clear cache
    // ============================================
    async clearCache() {
        this.responseCache.clear();
        this.notificationIdCache.clear();
        this.pendingRequests.clear();
        this.initialized = false;

        try {
            await AsyncStorage.removeItem(RESPONSES_CACHE_KEY);
            await AsyncStorage.removeItem(RESPONSE_STATUS_KEY);
            await AsyncStorage.removeItem(LAST_FETCH_KEY);

            console.log('🧹 AsyncStorage cache cleared');

        } catch (error) {
            console.error('Error clearing AsyncStorage:', error);
        }
    }
}

export const responseService = new ResponseNotificationService();
