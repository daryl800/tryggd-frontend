// Shared context for contact check-in data consumed by both Home and Activity.
// One fetch and one set of realtime subscriptions serve both tabs.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type ContactCheckinProfile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type ContactCheckinRow = {
  user_id: string;
  last_checked_in_utc: string | null;
  wellness_score: number | null;
  trip_status: string | null;
  home_presence: string | null;
  reach_out_status: string | null;
  checkin_timezone: string | null;
  checkin_timezone_label: string | null;
  display_name: string | null;
  priority: number;
};

export type ContactCheckinLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  checkinTimeIso: string;
};

type ContactCheckinsContextValue = {
  contactIds: string[];
  checkins: ContactCheckinRow[];
  profiles: Map<string, ContactCheckinProfile>;
  locationMap: Map<string, ContactCheckinLocation>;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const ContactCheckinsContext = createContext<ContactCheckinsContextValue>({
  contactIds: [],
  checkins: [],
  profiles: new Map(),
  locationMap: new Map(),
  isLoading: true,
  refresh: async () => {},
});

export const useContactCheckins = () => useContext(ContactCheckinsContext);

export function ContactCheckinsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [checkins, setCheckins] = useState<ContactCheckinRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ContactCheckinProfile>>(new Map());
  const [locationMap, setLocationMap] = useState<Map<string, ContactCheckinLocation>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setContactIds([]);
      setCheckins([]);
      setProfiles(new Map());
      setLocationMap(new Map());
      setIsLoading(false);
      return;
    }

    const { data: contactRows } = await supabase
      .from('contacts')
      .select('contact_user_id, contact_display_name')
      .eq('owner_user_id', user.id);

    const ids = ((contactRows || []) as any[])
      .map((r) => r.contact_user_id)
      .filter(Boolean) as string[];

    setContactIds(ids);

    if (ids.length === 0) {
      setCheckins([]);
      setProfiles(new Map());
      setLocationMap(new Map());
      setIsLoading(false);
      return;
    }

    const contactDisplayNames = new Map<string, string>(
      ((contactRows || []) as any[])
        .filter((r) => r.contact_user_id && r.contact_display_name)
        .map((r) => [r.contact_user_id as string, r.contact_display_name as string])
    );

    const [checkinsResult, profilesResult, locationsResult] = await Promise.all([
      supabase
        .from('users_latest_checkin')
        .select('*')
        .in('user_id', ids)
        .order('last_checked_in_utc', { ascending: false, nullsFirst: false }),
      (supabase.rpc('get_contact_usernames', { contact_ids: ids }) as unknown) as Promise<{
        data: Array<{
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }> | null;
        error: any;
      }>,
      supabase
        .from('notifications')
        .select('sender_user_id, data, created_at')
        .eq('user_id', user.id)
        .eq('type', 'contact_checkin')
        .in('sender_user_id', ids)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const profileMap = new Map<string, ContactCheckinProfile>();
    for (const p of profilesResult.data || []) {
      profileMap.set(p.id, {
        display_name: p.display_name || contactDisplayNames.get(p.id) || null,
        username: p.username || null,
        avatar_url: p.avatar_url || null,
      });
    }

    const locMap = new Map<string, ContactCheckinLocation>();
    for (const notif of (locationsResult.data || []) as any[]) {
      let payload: any = {};
      try {
        payload =
          typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data || {};
      } catch {}
      const location = payload.location;
      const checkinTimeIso = payload.checkinTimeIso;
      if (!notif.sender_user_id || !checkinTimeIso || location?.latitude == null) continue;
      const key = `${notif.sender_user_id}:${checkinTimeIso}`;
      if (!locMap.has(key)) {
        locMap.set(key, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters ?? null,
          checkinTimeIso,
        });
      }
    }

    setCheckins((checkinsResult.data || []) as ContactCheckinRow[]);
    setProfiles(profileMap);
    setLocationMap(locMap);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    setIsLoading(true);
    void fetchAll();
  }, [fetchAll]);

  // contacts table — re-fetch when contacts are added or removed
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ctx-contacts:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
          filter: `owner_user_id=eq.${user.id}`,
        },
        () => { void fetchAll(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  // users_latest_checkin — re-subscribe when contactIds change so the filter stays current
  useEffect(() => {
    if (!user || contactIds.length === 0) return;
    const channel = supabase
      .channel(`ctx-checkins:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users_latest_checkin',
          filter: `user_id=in.(${contactIds.join(',')})`,
        },
        () => { void fetchAll(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, contactIds, fetchAll]);

  // notifications — inline-update locationMap when a contact_checkin notification arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ctx-checkin-notifs:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new.type !== 'contact_checkin') return;
          let data: any = {};
          try {
            data =
              typeof payload.new.data === 'string'
                ? JSON.parse(payload.new.data)
                : payload.new.data || {};
          } catch {}
          const location = data.location;
          const checkinTimeIso = data.checkinTimeIso;
          const senderUserId = payload.new.sender_user_id;
          if (!senderUserId || !checkinTimeIso || location?.latitude == null) return;
          const key = `${senderUserId}:${checkinTimeIso}`;
          setLocationMap((prev) => {
            if (prev.has(key)) return prev;
            const next = new Map(prev);
            next.set(key, {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracyMeters: location.accuracyMeters ?? null,
              checkinTimeIso,
            });
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Foreground push — optimistic update from push payload, then DB confirm
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (!data?.contactUserId || !data?.checkinTimeIso) return;

      setCheckins((prev) => {
        const existing = prev.find((c) => c.user_id === data.contactUserId);
        if (existing && existing.last_checked_in_utc === data.checkinTimeIso) return prev;
        const optimistic: ContactCheckinRow = {
          user_id: data.contactUserId,
          last_checked_in_utc: data.checkinTimeIso,
          wellness_score: data.wellnessScore ?? null,
          trip_status: data.tripStatus ?? null,
          home_presence: data.homePresence ?? null,
          reach_out_status: data.reachOutStatus ?? null,
          checkin_timezone: null,
          checkin_timezone_label: null,
          display_name: data.contactDisplayName || null,
          priority: 0,
        };
        const filtered = prev.filter((c) => c.user_id !== data.contactUserId);
        return [optimistic, ...filtered].sort((a, b) =>
          (b.last_checked_in_utc ?? '').localeCompare(a.last_checked_in_utc ?? '')
        );
      });

      void fetchAll();
    });
    return () => subscription.remove();
  }, [fetchAll]);

  return (
    <ContactCheckinsContext.Provider
      value={{ contactIds, checkins, profiles, locationMap, isLoading, refresh: fetchAll }}
    >
      {children}
    </ContactCheckinsContext.Provider>
  );
}
