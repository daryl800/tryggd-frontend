// hooks/useStreak.ts
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

export const useStreak = () => {
    const { user } = useAuth();
    const [streak, setStreak] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStreak = useCallback(async () => {
        if (!user) {
            setStreak(0);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Call your PostgreSQL function using rpc()
            const { data, error: supabaseError } = await supabase
                .rpc('calculate_user_streak', { user_uuid: user.id });

            if (supabaseError) {
                console.error('Error fetching streak:', supabaseError);
                setError(supabaseError.message);
                setStreak(0);
                return;
            }

            // The function returns a single value (the streak count)
            setStreak(data || 0);

        } catch (err: any) {
            console.error('Error in useStreak:', err);
            setError(err.message);
            setStreak(0);
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Initial fetch
    useEffect(() => {
        fetchStreak();
    }, [fetchStreak]);

    // Refresh streak when app becomes active
    useEffect(() => {
        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === 'active') {
                fetchStreak();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            subscription.remove();
        };
    }, [fetchStreak]);

    // Refresh streak periodically (every hour)
    useEffect(() => {
        const interval = setInterval(fetchStreak, 60 * 60 * 1000); // Every hour
        return () => clearInterval(interval);
    }, [fetchStreak]);

    return {
        streak,
        loading,
        error,
        refetch: fetchStreak // This will now work correctly
    };
};