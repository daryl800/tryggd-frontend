// lib/auth/tokenManager.ts
import { supabase } from '../supabase';

class TokenManager {
    private static instance: TokenManager;
    private refreshInterval: ReturnType<typeof setInterval> | null = null;
    private readonly REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes

    static getInstance() {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    startAutoRefresh() {
        if (this.refreshInterval) return;

        // Check every minute
        this.refreshInterval = setInterval(async () => {
            await this.refreshIfNeeded();
        }, 60 * 1000);

        console.log('🔄 Token auto-refresh started');
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('🔄 Token auto-refresh stopped');
        }
    }

    private async refreshIfNeeded() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.expires_at) return;

        const expiresAt = session.expires_at * 1000;
        const timeUntilExpiry = expiresAt - Date.now();

        if (timeUntilExpiry < this.REFRESH_BUFFER) {
            console.log('🔄 Token expiring soon, refreshing...');
            await this.refreshTokenNow();
        }
    }

    async refreshTokenNow() {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
            console.error('Failed to refresh token:', error);
            return null;
        }
        console.log('✅ Token refreshed successfully');
        return data.session?.access_token || null;
    }

    async getValidToken(): Promise<string | null> {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) return null;

        // Check if token needs refresh
        if (session.expires_at) {
            const expiresAt = session.expires_at * 1000;
            if (Date.now() >= expiresAt - this.REFRESH_BUFFER) {
                return await this.refreshTokenNow();
            }
        }

        return session.access_token;
    }
}

export const tokenManager = TokenManager.getInstance();