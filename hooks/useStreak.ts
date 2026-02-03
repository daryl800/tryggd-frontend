// hooks/useStreak.ts
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const useStreak = () => {
    const [streak, setStreak] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStreak = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setStreak(0);
                return;
            }

            // Call PostgreSQL function (server-side calculation)
            const { data, error: rpcError } = await supabase.rpc('calculate_user_streak', {
                user_uuid: user.id
            });

            if (rpcError) {
                console.error('RPC Error:', rpcError);
                throw rpcError;
            }

            setStreak(data || 0);
        } catch (err: any) {
            console.error('Error fetching streak:', err);
            setError(err.message);
            setStreak(0);
        } finally {
            setLoading(false);
        }
    }, []);

    // Real-time subscription for check-ins
    useEffect(() => {
        let channel: any;

        const setupSubscription = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            channel = supabase
                .channel(`streak-updates-${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'checkins',
                        filter: `user_id=eq.${user.id}`
                    },
                    () => {
                        fetchStreak(); // Refresh when user checks in
                    }
                )
                .subscribe();
        };

        setupSubscription();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [fetchStreak]);

    // Initial fetch
    useEffect(() => {
        fetchStreak();
    }, [fetchStreak]);

    return {
        streak,
        loading,
        error,
        refreshStreak: fetchStreak
    };
};