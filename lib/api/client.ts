// lib/client.ts (optional - if you want a generic client)
import { tokenManager } from './auth/tokenManager';

class ApiClient {
    async request(endpoint: string, options: RequestInit = {}) {
        const token = await tokenManager.getValidToken();

        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(endpoint, {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        return response;
    }
}

export const apiClient = new ApiClient();