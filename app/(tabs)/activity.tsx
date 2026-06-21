// screens/ActivityScreen.tsx
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useContactCheckins } from '@/contexts/ContactCheckinsContext';
import { getLastWelfareCheckSentAt, hasSentWelfareCheck, sendWelfareCheckNotification } from '@/lib/notifications/core';
import { responseService } from '@/lib/notifications/responseService';
import { useStreak } from '@/hooks/useStreak';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { iosFontSize } from '@/constants/typography';
import { isLocalAvatarUri } from '@/lib/profile/avatarStorage';

type Activity = {
  user_id: string;
  display_name: string;
  last_checked_in_utc: string | null;
  priority: number;
  action_state?: 'like' | 'today_check' | 'overdue_check' | 'none' | null;
  recency_status?: 'today' | 'yesterday' | 'older' | 'none' | null;
  wellness_score?: number | null;
  trip_status?: string | null;
  home_presence?: string | null;
  reach_out_status?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  is_owner?: boolean;
  hasNewUpdate?: boolean;
  checkin_timezone?: string | null;
  checkin_timezone_label?: string | null;
  shared_location?: SharedLocationInfo | null;
  isNewContact?: boolean;
};

type SharedLocationInfo = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  checkinTimeIso?: string | null;
};

type ResponseNotification = {
  id: string;
  user_id: string;
  sender_user_id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  created_at: string;
  sender?: {
    display_name: string;
  };
};

const ACTIVITY_NOTIFICATION_TYPES = ['checkin_response', 'welfare_check', 'emergency_message'] as const;
const PLACEHOLDER_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const OVERDUE_WELFARE_COOLDOWN_HOURS = 12;
const isActivityNotificationType = (type?: string | null) =>
  !!type && ACTIVITY_NOTIFICATION_TYPES.includes(type as (typeof ACTIVITY_NOTIFICATION_TYPES)[number]);

const EMOJI_CHARS = '[\\u{1F000}-\\u{1FFFF}\\u2600-\\u27FF]';
const LEADING_EMOJI_RE = new RegExp(`^${EMOJI_CHARS}+️?\\s*`, 'u');
const TRAILING_EMOJI_RE = new RegExp(`\\s*${EMOJI_CHARS}+$`, 'u');

const splitLabelEmoji = (label: string) => {
  const leading = label.match(LEADING_EMOJI_RE);
  if (leading) {
    return { text: label.slice(leading[0].length).trim(), emoji: leading[0].trim(), position: 'leading' as const };
  }
  const trailing = label.match(TRAILING_EMOJI_RE);
  if (trailing) {
    return { text: label.slice(0, -trailing[0].length).trim(), emoji: trailing[0].trim(), position: 'trailing' as const };
  }
  return { text: label, emoji: '', position: 'trailing' as const };
};

export default function ActivityScreen() {
  const { t } = useTranslation();

  const getLocalizedTimezoneLabel = useCallback((label?: string | null) => {
    const normalized = label?.trim();
    if (!normalized) return '';

    const labelMap: Record<string, string> = {
      UTC: t('activity.timezoneLabels.utc'),
      China: t('activity.timezoneLabels.china'),
      'Hong Kong': t('activity.timezoneLabels.hongKong'),
      Taiwan: t('activity.timezoneLabels.taiwan'),
      Sweden: t('activity.timezoneLabels.sweden'),
      Norway: t('activity.timezoneLabels.norway'),
      Denmark: t('activity.timezoneLabels.denmark'),
      Finland: t('activity.timezoneLabels.finland'),
    };

    return labelMap[normalized] || normalized;
  }, [t]);
  const { user } = useAuth();
  const { streak } = useStreak();

  // State
  // Shared contact check-in data (one fetch/subscription shared with Home)
  const {
    contactIds,
    checkins: contactCheckins,
    profiles: contactProfiles,
    locationMap: contactLocationMap,
    isLoading: checkinsLoading,
    refresh: refreshCheckins,
  } = useContactCheckins();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setResponses] = useState<ResponseNotification[]>([]);
  const [, setUnreadResponses] = useState<ResponseNotification[]>([]);
  const [todayResponses, setTodayResponses] = useState<ResponseNotification[]>([]);

  // Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastCheckinTimes = useRef<Map<string, string>>(new Map());
  const ownerTimezoneRef = useRef<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const isInitialized = useRef(false);

  // Channel refs
  const ownerCheckinsChannelRef = useRef<any>(null);
  const responsesChannelRef = useRef<any>(null);
  const todayResponsesChannelRef = useRef<any>(null);

  // ============================================
  // Helper Functions
  // ============================================
  const isTodayLocal = (dateStr: string, timezone: string): boolean => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const dateLocalStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
      const nowLocalStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
      return dateLocalStr === nowLocalStr;
    } catch (error) {
      console.error('Error checking if date is today:', error);
      return false;
    }
  };

  // ============================================
  // Data Fetching Functions
  // ============================================
  const fetchOwnerActivity = async () => {
    try {
      if (!user) return;

      const [{ data, error }, { data: profileData, error: profileError }] = await Promise.all([
        supabase
          .from('users_latest_checkin')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('profiles')
          .select('avatar_url, username')
          .eq('id', user.id)
          .single(),
      ]);

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching owner activity:', error);
        return;
      }
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching owner avatar:', profileError);
      }

      const ownerAvatarUrl = profileData?.avatar_url || '';
      const ownerUsername = profileData?.username || '';

      if (data) {
        const isNew = !lastCheckinTimes.current.has(user.id) ||
          lastCheckinTimes.current.get(user.id) !== data.last_checked_in_utc;

        lastCheckinTimes.current.set(user.id, data.last_checked_in_utc);

        setOwnerActivity({
          ...data,
          display_name: t('activity.you'),
          username: ownerUsername,
          avatar_url: ownerAvatarUrl,
          is_owner: true,
          hasNewUpdate: isNew,
          checkin_timezone: data.checkin_timezone,
          checkin_timezone_label: data.checkin_timezone_label || null,
        });

        if (data.checkin_timezone) {
          ownerTimezoneRef.current = data.checkin_timezone;
        }
      } else {
        setOwnerActivity({
          user_id: user.id,
          display_name: t('activity.you'),
          username: ownerUsername,
          last_checked_in_utc: null,
          priority: 0,
          avatar_url: ownerAvatarUrl,
          is_owner: true,
          hasNewUpdate: false,
          checkin_timezone: null,
          checkin_timezone_label: null,
        });
      }
    } catch (err) {
      console.error('Error fetching owner activity:', err);
    }
  };

  // Builds the Activity[] list from shared context data + action states RPC.
  // Called whenever context checkins/profiles/locationMap change.
  const buildActivities = useCallback(async () => {
    if (checkinsLoading) return;

    if (contactIds.length === 0) {
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      const { data: actionStates, error: actionStateError } = await supabase.rpc(
        'get_activity_action_states',
        { p_contact_ids: contactIds }
      ) as {
        data: {
          user_id: string;
          action_state: Activity['action_state'];
          recency_status: Activity['recency_status'];
          action_reference_time: string | null;
        }[] | null;
        error: any;
      };

      if (actionStateError) throw actionStateError;

      const actionStateMap = new Map(
        (actionStates || []).map((row) => [
          row.user_id,
          {
            action_state: row.action_state || null,
            recency_status: row.recency_status || null,
          },
        ])
      );

      const checkedInIds = new Set(contactCheckins.map((c) => c.user_id));

      const enriched = contactCheckins.map((c) => {
        const profile = contactProfiles.get(c.user_id);
        const isNew =
          !lastCheckinTimes.current.has(c.user_id) ||
          lastCheckinTimes.current.get(c.user_id) !== c.last_checked_in_utc;

        if (c.last_checked_in_utc) {
          lastCheckinTimes.current.set(c.user_id, c.last_checked_in_utc);
        }

        return {
          ...c,
          display_name: profile?.display_name || c.display_name || '',
          username: profile?.username || null,
          avatar_url: profile?.avatar_url || null,
          action_state: actionStateMap.get(c.user_id)?.action_state || null,
          recency_status: actionStateMap.get(c.user_id)?.recency_status || null,
          hasNewUpdate: isNew,
          shared_location: c.last_checked_in_utc
            ? contactLocationMap.get(`${c.user_id}:${new Date(c.last_checked_in_utc).toISOString()}`) || null
            : null,
          isNewContact: false,
        };
      });

      const placeholders: Activity[] = contactIds
        .filter((id) => !checkedInIds.has(id))
        .map((id) => {
          const profile = contactProfiles.get(id);
          return {
            user_id: id,
            display_name: profile?.display_name || '',
            username: profile?.username || null,
            avatar_url: profile?.avatar_url || null,
            last_checked_in_utc: PLACEHOLDER_TIMESTAMP,
            priority: -1,
            action_state: 'overdue_check' as const,
            recency_status: null,
            wellness_score: null,
            hasNewUpdate: false,
            checkin_timezone: null,
            checkin_timezone_label: null,
            shared_location: null,
            isNewContact: true,
          };
        });

      const sorted = [...enriched, ...placeholders].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (b.last_checked_in_utc ?? '').localeCompare(a.last_checked_in_utc ?? '');
      });

      setActivities(sorted);
    } catch (err) {
      console.error('Error building activities:', err);
    } finally {
      setLoading(false);
    }
  }, [contactIds, contactCheckins, contactProfiles, contactLocationMap, checkinsLoading]);

  const fetchResponseNotifications = async () => {
    try {
      if (!user) return;

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('type', [...ACTIVITY_NOTIFICATION_TYPES])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        setResponses([]);
        setUnreadResponses([]);
        return;
      }

      const senderIds = notifications.map(n => n.sender_user_id).filter(Boolean);
      let senderMap: Record<string, string> = {};

      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', senderIds);

        if (profiles) {
          profiles.forEach(profile => {
            senderMap[profile.id] = profile.display_name;
          });
        }
      }

      const enriched = notifications.map(notification => {
        let parsedData = {};
        try {
          parsedData = typeof notification.data === 'string'
            ? JSON.parse(notification.data)
            : notification.data || {};
        } catch (e) {
          console.error('Error parsing notification data:', e);
        }

        return {
          ...notification,
          data: parsedData,
          sender: {
            display_name: senderMap[notification.sender_user_id] ||
              (parsedData as any).senderName ||
              'Someone'
          }
        };
      });

      setResponses(enriched);
      setUnreadResponses(enriched.filter(r => !r.read));

    } catch (error) {
      console.error('Error fetching response notifications:', error);
    }
  };

  const fetchUnreadResponseNotifications = async () => {
    try {
      if (!user) return;

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('type', [...ACTIVITY_NOTIFICATION_TYPES])
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        setUnreadResponses([]);
        return;
      }

      const senderIds = notifications.map(n => n.sender_user_id).filter(Boolean);
      let senderMap: Record<string, string> = {};

      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', senderIds);

        if (profiles) {
          profiles.forEach(profile => {
            senderMap[profile.id] = profile.display_name;
          });
        }
      }

      const enriched = notifications.map(notification => {
        let parsedData = {};
        try {
          parsedData = typeof notification.data === 'string'
            ? JSON.parse(notification.data)
            : notification.data || {};
        } catch (e) {
          console.error('Error parsing notification data:', e);
        }

        return {
          ...notification,
          data: parsedData,
          sender: {
            display_name: senderMap[notification.sender_user_id] ||
              (parsedData as any).senderName ||
              'Someone'
          }
        };
      });

      setUnreadResponses(enriched);
    } catch (error) {
      console.error('Error fetching unread responses:', error);
    }
  };

  const loadInitialTodayResponses = async () => {
    try {
      if (!user) return;

      const userTimezone = ownerTimezoneRef.current;

      // 36-hour lookback covers any UTC offset (max is UTC+14).
      // Client-side isTodayLocal then filters to only today in the user's timezone.
      const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);

      // First, fetch the notifications
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('type', [...ACTIVITY_NOTIFICATION_TYPES])
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        return;
      }

      // Get unique sender IDs
      const senderIds = [...new Set(notifications
        .map(n => n.sender_user_id)
        .filter(Boolean))];

      // Fetch sender profiles separately
      let senderMap: Record<string, string> = {};

      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', senderIds);

        if (profiles) {
          profiles.forEach(profile => {
            senderMap[profile.id] = profile.display_name;
          });
        }
      }

      // Enrich notifications with sender names
      const enriched = notifications.map(notification => {
        let parsedData = {};
        try {
          parsedData = typeof notification.data === 'string'
            ? JSON.parse(notification.data)
            : notification.data || {};
        } catch (e) {
          console.error('Error parsing notification data:', e);
        }

        return {
          ...notification,
          data: parsedData,
          sender: {
            display_name: senderMap[notification.sender_user_id] ||
              (parsedData as any).senderName ||
              'Someone'
          }
        };
      });

      // Filter to only today in the user's local timezone (36h window may include yesterday)
      const todayEnriched = enriched.filter(n => isTodayLocal(n.created_at, userTimezone));

      // Merge with existing realtime items — never wipe state, only add/update
      setTodayResponses(prev => {
        const map = new Map(prev.map(r => [r.id, r]));
        todayEnriched.forEach(r => map.set(r.id, r));
        return [...map.values()].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
      console.log(`✅ Loaded ${todayEnriched.length} today's responses`);

    } catch (error) {
      console.error('Error loading today responses:', error);
    }
  };

  // ============================================
  // Subscription Setup Functions
  // ============================================
  // Note: users_latest_checkin, contacts, and contact_checkin notifications are
  // subscribed in ContactCheckinsContext — no duplicate subscriptions here.

  const setupOwnerCheckinsSubscription = () => {
    if (ownerCheckinsChannelRef.current) {
      supabase.removeChannel(ownerCheckinsChannelRef.current);
    }

    if (!user) return;

    const channel = supabase
      .channel('owner-checkins-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users_latest_checkin',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            lastCheckinTimes.current.delete(user.id);
            setOwnerActivity((prev) => ({
              user_id: user.id,
              display_name: t('activity.you'),
              username: prev?.username || null,
              last_checked_in_utc: null,
              priority: 0,
              avatar_url: prev?.avatar_url || null,
              is_owner: true,
              hasNewUpdate: false,
              checkin_timezone: null,
              checkin_timezone_label: null,
            }));
            return;
          }

          if (payload.new) {
            const isNew = !lastCheckinTimes.current.has(user.id) ||
              lastCheckinTimes.current.get(user.id) !== payload.new.last_checked_in_utc;

            if (payload.new.last_checked_in_utc) {
              lastCheckinTimes.current.set(user.id, payload.new.last_checked_in_utc);
            }

            setOwnerActivity((prev) => ({
              user_id: payload.new.user_id,
              last_checked_in_utc: payload.new.last_checked_in_utc,
              priority: payload.new.priority,
              display_name: t('activity.you'),
              username: prev?.username || null,
              avatar_url: prev?.avatar_url || null,
              is_owner: true,
              hasNewUpdate: isNew,
              checkin_timezone: payload.new.checkin_timezone,
              checkin_timezone_label: payload.new.checkin_timezone_label || null,
              wellness_score: payload.new.wellness_score ?? null,
              trip_status: payload.new.trip_status ?? null,
              home_presence: payload.new.home_presence ?? null,
              reach_out_status: payload.new.reach_out_status ?? null,
              shared_location: null,
            }));

            if (payload.new.checkin_timezone) {
              ownerTimezoneRef.current = payload.new.checkin_timezone;
            }
          }
        }
      )
      .subscribe();

    ownerCheckinsChannelRef.current = channel;
  };

  const setupResponsesSubscription = () => {
    if (responsesChannelRef.current) {
      supabase.removeChannel(responsesChannelRef.current);
    }

    if (!user) return;

    const channel = supabase
      .channel('response-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          if (isActivityNotificationType(payload.new.type)) {
            console.log('📬 New response notification received');

            let parsedData = {};
            try {
              parsedData = typeof payload.new.data === 'string'
                ? JSON.parse(payload.new.data)
                : payload.new.data || {};
            } catch (e) {
              console.error('Error parsing notification data:', e);
            }

            let senderName = 'Someone';
            if (payload.new.sender_user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', payload.new.sender_user_id)
                .single();

              senderName = profile?.display_name || (parsedData as any).senderName || 'Someone';
            }

            const newNotification: ResponseNotification = {
              id: payload.new.id,
              user_id: payload.new.user_id,
              sender_user_id: payload.new.sender_user_id,
              type: payload.new.type,
              title: payload.new.title,
              body: payload.new.body,
              data: parsedData,
              read: payload.new.read,
              created_at: payload.new.created_at,
              sender: { display_name: senderName }
            };

            // Update responses - prevent duplicates
            setResponses(prev => {
              if (prev.some(r => r.id === newNotification.id)) {
                return prev;
              }
              return [newNotification, ...prev];
            });

            // Update unread - prevent duplicates
            if (!payload.new.read) {
              setUnreadResponses(prev => {
                if (prev.some(r => r.id === newNotification.id)) {
                  return prev;
                }
                return [newNotification, ...prev];
              });
            }

            // Update today responses - prevent duplicates
            if (isTodayLocal(payload.new.created_at, ownerTimezoneRef.current)) {
              setTodayResponses(prev => {
                if (prev.some(r => r.id === newNotification.id)) {
                  return prev;
                }
                return [newNotification, ...prev];
              });
            }
          }
        }
      )
      .subscribe();

    responsesChannelRef.current = channel;
  };

  const setupTodayResponsesSubscription = () => {
    if (todayResponsesChannelRef.current) {
      supabase.removeChannel(todayResponsesChannelRef.current);
    }

    if (!user) return;

    const channel = supabase
      .channel('today-responses-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          if (isActivityNotificationType(payload.new.type) &&
            isTodayLocal(payload.new.created_at, ownerTimezoneRef.current)) {

            // Parse data
            let parsedData = {};
            try {
              parsedData = typeof payload.new.data === 'string'
                ? JSON.parse(payload.new.data)
                : payload.new.data || {};
            } catch (e) {
              console.error('Error parsing notification data:', e);
            }

            // Get sender name
            let senderName = 'Someone';
            if (payload.new.sender_user_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', payload.new.sender_user_id)
                .single();

              senderName = profile?.display_name ||
                (parsedData as any).senderName ||
                'Someone';
            }

            const newResponse = {
              id: payload.new.id,
              user_id: payload.new.user_id,
              sender_user_id: payload.new.sender_user_id,
              type: payload.new.type,
              title: payload.new.title,
              body: payload.new.body,
              data: parsedData,
              read: payload.new.read,
              created_at: payload.new.created_at,
              sender: { display_name: senderName }
            };

            // Check if response already exists before adding
            setTodayResponses(prev => {
              // Don't add if already exists
              if (prev.some(r => r.id === newResponse.id)) {
                console.log('⚠️ Duplicate response ignored:', newResponse.id);
                return prev;
              }
              return [newResponse, ...prev];
            });
          }
        }
      )
      .subscribe();

    todayResponsesChannelRef.current = channel;
  };

  // ============================================
  // Action Functions
  // ============================================
  // ============================================
  // Initialization
  // ============================================
  const initialize = useCallback(async () => {
    if (isInitialized.current || !user) return;

    console.log('🚀 Initializing Activity Screen');
    isInitialized.current = true;

    try {
      await Promise.all([
        fetchOwnerActivity(),
        fetchResponseNotifications(),
        loadInitialTodayResponses(),
      ]);

      setupOwnerCheckinsSubscription();
      setupResponsesSubscription();
      setupTodayResponsesSubscription();

    } catch (error) {
      console.error('Error during initialization:', error);
    }
  }, [user]);

  // ============================================
  // Effects
  // ============================================
  useEffect(() => {
    // Initialize response service
    responseService.initialize();

    // Initialize the screen
    initialize();

    // Animate fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // App state listener
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        console.log('📱 App became active - refreshing data');
        fetchOwnerActivity();
        void refreshCheckins(); // triggers buildActivities via context useEffect
        fetchResponseNotifications();
        loadInitialTodayResponses();
        setupResponsesSubscription();
        setupTodayResponsesSubscription();
      }
    });

    // Cleanup
    return () => {
      subscription.remove();

      const channels = [
        ownerCheckinsChannelRef.current,
        responsesChannelRef.current,
        todayResponsesChannelRef.current,
      ];

      channels.forEach((channel) => {
        if (channel) supabase.removeChannel(channel);
      });

      isInitialized.current = false;
      lastCheckinTimes.current.clear();
    };
  }, [initialize, refreshCheckins]);

  // Rebuild activities whenever context check-in data changes
  useEffect(() => {
    void buildActivities();
  }, [buildActivities]);

  // Focus effect for when tab is revisited
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 Screen focused - refreshing data');
      fetchOwnerActivity();
      void refreshCheckins(); // triggers buildActivities via context useEffect
      fetchResponseNotifications();
      loadInitialTodayResponses();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ============================================
  // ResponseItem Component
  // ============================================
  // ============================================
  // ActivityItem Component
  // ============================================
  const ActivityItem = ({
    name,
    username,
    avatarUrl,
    timestamp,
    priority,
    isOwner = false,
    hasNewUpdate = false,
    userId,
    isLast = false,
    checkin_timezone,
    checkin_timezone_label,
    action_state,
    recency_status,
    wellness_score,
    trip_status,
    home_presence,
    reach_out_status,
    shared_location,
    isNewContact = false,
  }: {
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    timestamp: string | null;
    priority: number;
    isOwner?: boolean;
    hasNewUpdate?: boolean;
    userId: string;
    isLast?: boolean;
    checkin_timezone?: string | null;
    checkin_timezone_label?: string | null;
    action_state?: Activity['action_state'];
    recency_status?: Activity['recency_status'];
    wellness_score?: number | null;
    trip_status?: string | null;
    home_presence?: string | null;
    reach_out_status?: string | null;
    shared_location?: SharedLocationInfo | null;
    isNewContact?: boolean;
  }) => {
    const { t } = useTranslation();
    const { user, capabilities } = useAuth();
    const timeScaleAnim = useRef(new Animated.Value(1)).current;
    const timeColorAnim = useRef(new Animated.Value(0)).current;
    const displayAvatarUrl = (avatarUrl?.trim() && !isLocalAvatarUri(avatarUrl)) ? avatarUrl.trim() : '';

    const [sendingResponse, setSendingResponse] = useState(false);
    const [sendingWelfareCheck, setSendingWelfareCheck] = useState(false);
    const [fetchingLocation, setFetchingLocation] = useState(false);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const [responseSent, setResponseSent] = useState(() => {
      if (!user || !timestamp || isOwner) return false;
      const cacheKey = `${userId}_${user.id}_${timestamp}`;
      return responseService.hasCachedResponse(cacheKey);
    });
    const [welfareCheckSent, setWelfareCheckSent] = useState<boolean>(false);
    const [lastWelfareCheckSentAt, setLastWelfareCheckSentAt] = useState<string | null>(null);
    const [wellnessTooltipVisible, setWellnessTooltipVisible] = useState(false);
    const wellnessTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [tripTooltipVisible, setTripTooltipVisible] = useState(false);
    const tripTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [homePresenceTooltipVisible, setHomePresenceTooltipVisible] = useState(false);
    const homePresenceTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [reachOutTooltipVisible, setReachOutTooltipVisible] = useState(false);
    const reachOutTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const welfareCheckMountedRef = useRef(false);

    useEffect(() => {
      setAvatarLoadFailed(false);
    }, [displayAvatarUrl]);

    const getFallbackRecencyStatus = useCallback((): NonNullable<Activity['recency_status']> => {
      if (!timestamp) {
        return 'none';
      }

      try {
        const lastCheckIn = new Date(timestamp);
        const now = new Date();

        const lastDateStr = lastCheckIn.toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];

        const lastHour = lastCheckIn.getUTCHours();
        const nowHour = now.getUTCHours();

        let adjustedLastDate = lastDateStr;
        if (lastHour >= 23) {
          const nextDay = new Date(lastCheckIn);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          adjustedLastDate = nextDay.toISOString().split('T')[0];
        }

        let adjustedToday = todayStr;
        if (nowHour >= 23) {
          const nextDay = new Date(now);
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          adjustedToday = nextDay.toISOString().split('T')[0];
        }

        if (adjustedLastDate === adjustedToday) {
          return 'today';
        }

        const yesterday = new Date(adjustedToday);
        const yesterdayParts = adjustedToday.split('-').map(Number);
        yesterday.setUTCFullYear(yesterdayParts[0], yesterdayParts[1] - 1, yesterdayParts[2] - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (adjustedLastDate === yesterdayStr) {
          return 'yesterday';
        }

        return 'older';
      } catch {
        return 'none';
      }
    }, [timestamp]);

    const resolvedRecencyStatus = recency_status || getFallbackRecencyStatus();
    const fallbackActionState: Activity['action_state'] =
      resolvedRecencyStatus === 'today'
        ? 'like'
        : resolvedRecencyStatus === 'yesterday'
          ? 'today_check'
          : resolvedRecencyStatus === 'older'
            ? 'overdue_check'
            : 'none';
    const resolvedActionState = action_state || fallbackActionState;

    useEffect(() => {
      const checkIfResponded = async () => {
        if (!user || !timestamp || isOwner || responseSent) return;
        const alreadyResponded = await responseService.hasResponded(userId, user.id, timestamp);
        if (alreadyResponded) setResponseSent(true);
      };
      checkIfResponded();
    }, [userId, user?.id, timestamp, isOwner, responseSent]);

    useEffect(() => {
      const checkIfWelfareSent = async () => {
        if (!user || !timestamp || isOwner) return;
        const currentWelfareKind = resolvedActionState === 'today_check' ? 'today_check' : 'overdue_check';
        if (currentWelfareKind === 'overdue_check') {
          const sentAt = await getLastWelfareCheckSentAt(userId, user.id, timestamp, currentWelfareKind);
          setLastWelfareCheckSentAt(sentAt);
          setWelfareCheckSent(false);
        } else {
          const alreadySent = await hasSentWelfareCheck(userId, user.id, timestamp, currentWelfareKind);
          setWelfareCheckSent(alreadySent);
          setLastWelfareCheckSentAt(null);
        }
      };
      checkIfWelfareSent();
    }, [userId, user?.id, timestamp, isOwner, resolvedActionState]);

    useFocusEffect(
      useCallback(() => {
        if (!welfareCheckMountedRef.current) {
          welfareCheckMountedRef.current = true;
          return;
        }
        const checkOnFocus = async () => {
          if (!user || !timestamp || isOwner) return;
          const alreadyResponded = await responseService.hasResponded(userId, user.id, timestamp);
          setResponseSent(alreadyResponded);
          const currentWelfareKind = resolvedActionState === 'today_check' ? 'today_check' : 'overdue_check';
          if (currentWelfareKind === 'overdue_check') {
            const sentAt = await getLastWelfareCheckSentAt(userId, user.id, timestamp, currentWelfareKind);
            setLastWelfareCheckSentAt(sentAt);
            setWelfareCheckSent(false);
          } else {
            const alreadySent = await hasSentWelfareCheck(userId, user.id, timestamp, currentWelfareKind);
            setWelfareCheckSent(alreadySent);
            setLastWelfareCheckSentAt(null);
          }
        };
        checkOnFocus();
      }, [userId, user?.id, timestamp, isOwner, resolvedActionState])
    );

    const isLikeMode = resolvedActionState === 'like';
    const isTodayCheckMode = capabilities.canUseWelfareGreeting && resolvedActionState === 'today_check';
    const isWelfareMode = capabilities.canUseWelfareGreeting && resolvedActionState === 'overdue_check';
    const isSupportMode = isLikeMode && typeof wellness_score === 'number' && wellness_score <= -1;
    const isReachOutResponseMode = isLikeMode && !!reach_out_status;
    const overdueCooldownActive =
      isWelfareMode &&
      !!lastWelfareCheckSentAt &&
      Date.now() - new Date(lastWelfareCheckSentAt).getTime() < OVERDUE_WELFARE_COOLDOWN_HOURS * 3600000;
    const isButtonEnabled = isLikeMode && !isOwner && !responseSent;
    const isSingleActionEnabled =
      (isLikeMode && !responseSent) ||
      (isTodayCheckMode && !welfareCheckSent) ||
      (isWelfareMode && !overdueCooldownActive);

    const handleSendResponse = async () => {
      if (sendingResponse || !isButtonEnabled || !user) return;

      setSendingResponse(true);
      try {
        const alreadyResponded = await responseService.hasResponded(userId, user.id, timestamp || '');
        if (alreadyResponded) {
          setResponseSent(true);
          return;
        }

        const result = await responseService.sendResponse({
          recipientUserId: userId,
          senderUserId: user.id,
          checkinTime: timestamp || '',
          responseKind: isReachOutResponseMode ? 'reach_out' : isSupportMode ? 'support' : 'like',
        });

        if (result.success) {
          setResponseSent(true);
        }
      } catch (error) {
        console.error('Error sending response:', error);
      } finally {
        setSendingResponse(false);
      }
    };

    const handleSendWelfareCheck = async () => {
      if (
        sendingWelfareCheck ||
        (!isTodayCheckMode && !isWelfareMode) ||
        (isTodayCheckMode && welfareCheckSent) ||
        (isWelfareMode && overdueCooldownActive) ||
        !user ||
        !timestamp
      ) return;

      setSendingWelfareCheck(true);
      try {
        const result = await sendWelfareCheckNotification({
          receiverUserId: userId,
          senderUserId: user.id,
          senderName: user.user_metadata?.display_name || user.user_metadata?.name,
          checkinTime: timestamp,
          welfareKind: isTodayCheckMode ? 'today_check' : 'overdue_check',
          cooldownHours: isWelfareMode ? OVERDUE_WELFARE_COOLDOWN_HOURS : undefined,
        });

        if (result.success) {
          if (isWelfareMode) {
            setLastWelfareCheckSentAt(new Date().toISOString());
          } else {
            setWelfareCheckSent(true);
          }
        } else if (result.error) {
          Alert.alert(t('errors.title'), result.error);
        }
      } catch (error) {
        console.error('Error sending welfare check:', error);
        Alert.alert(t('errors.title'), 'Failed to send welfare check');
      } finally {
        setSendingWelfareCheck(false);
      }
    };

    const openSharedLocation = async () => {
      if (!shared_location) return;

      const url = `https://www.google.com/maps/search/?api=1&query=${shared_location.latitude},${shared_location.longitude}`;

      try {
        await Linking.openURL(url);
      } catch (error) {
        console.error('Error opening shared location:', error);
        Alert.alert(t('errors.title'), t('activity.errors.openSharedLocation'));
      }
    };

    const openCurrentLocation = async () => {
      if (fetchingLocation) return;
      setFetchingLocation(true);
      try {
        const locationModule = await import('expo-location');
        const Location = locationModule?.default ?? locationModule;

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('errors.title'), t('activity.errors.openSharedLocation'));
          return;
        }

        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced ?? 3 }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (!position) {
          Alert.alert(t('errors.title'), t('activity.errors.openSharedLocation'));
          return;
        }

        const url = `https://www.google.com/maps/search/?api=1&query=${position.coords.latitude},${position.coords.longitude}`;
        await Linking.openURL(url);
      } catch (error) {
        console.error('Error opening current location:', error);
        Alert.alert(t('errors.title'), t('activity.errors.openSharedLocation'));
      } finally {
        setFetchingLocation(false);
      }
    };

    const formatActivityTime = (
      timestamp: string | null,
      timezone?: string | null,
      timezoneLabel?: string | null
    ) => {
      let timeText = '';
      let dateText = '';
      let timezoneText = '';
      const isValidTimestamp = timestamp && !isNaN(new Date(timestamp).getTime());

      if (isValidTimestamp) {
        try {
          const d = new Date(timestamp!);
          const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

          timeText = d.toLocaleTimeString(t('activity.time.locale'), {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz,
          });

          const dLocalStr = d.toLocaleDateString('en-CA', { timeZone: tz });
          const today = new Date();
          const todayLocalStr = today.toLocaleDateString('en-CA', { timeZone: tz });

          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayLocalStr = yesterday.toLocaleDateString('en-CA', { timeZone: tz });

          if (dLocalStr === todayLocalStr) {
            dateText = t('activity.day.today');
          } else if (dLocalStr === yesterdayLocalStr) {
            dateText = t('activity.day.yesterday');
          } else {
            const locale = t('activity.time.locale');
            const weekday = d.toLocaleDateString(locale, {
              weekday: 'short',
              timeZone: tz,
            }).replace('.', '');

            if (locale.startsWith('zh')) {
              const datePart = d.toLocaleDateString(locale, {
                month: 'short',
                day: 'numeric',
                timeZone: tz,
              });
              dateText = `${weekday}，${datePart}`;
            } else {
              const dayOfMonth = d.getDate();
              const monthName = d.toLocaleDateString(locale, {
                month: 'short',
                timeZone: tz,
              });
              dateText = `${weekday}, ${dayOfMonth} ${monthName}`;
            }
          }

          if (timezoneLabel && timezoneLabel.trim() !== '') {
            timezoneText = getLocalizedTimezoneLabel(timezoneLabel);
          } else {
            const parts = tz.split('/');
            timezoneText = parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ') : tz;
          }

        } catch (error) {
          console.error('Error formatting time:', error);
        }
      }

      return { timeText, dateText, timezoneText, isValidTimestamp };
    };

    const getWellnessMeta = (score?: number | null) => {
      if (typeof score !== 'number') return null;

      if (score <= -2) {
        return {
          color: '#7A5C4D',
          backgroundColor: '#F3F3F3',
          borderColor: '#D0D0D0',
          labelKey: 'activity.wellness.veryLow',
        };
      }

      if (score === -1) {
        return {
          color: '#6B8DA4',
          backgroundColor: '#E4EFF6',
          borderColor: '#A8C4D6',
          labelKey: 'activity.wellness.low',
        };
      }

      if (score === 0) {
        return {
          color: BaseColors.primary,
          backgroundColor: BaseColors.primaryLight,
          borderColor: BaseColors.primaryBorder,
          labelKey: 'activity.wellness.neutral',
        };
      }

      if (score === 1) {
        return {
          color: '#AFC04A',
          backgroundColor: '#F4F7E0',
          borderColor: '#CFDA8A',
          labelKey: 'activity.wellness.good',
        };
      }

      return {
        color: '#FFD700',
        backgroundColor: '#FFF8DC',
        borderColor: '#E8C64A',
        labelKey: 'activity.wellness.great',
      };
    };

    const { timeText, dateText, timezoneText, isValidTimestamp } = formatActivityTime(
      timestamp,
      checkin_timezone,
      checkin_timezone_label
    );
    const wellnessMeta = reach_out_status ? null : getWellnessMeta(wellness_score);
    const staleHours = isValidTimestamp
      ? Math.floor((Date.now() - new Date(timestamp as string).getTime()) / 3600000)
      : 0;
    const staleDays = staleHours >= 24 ? Math.max(1, Math.floor(staleHours / 24)) : 0;
    const showStaleWarning = !isOwner && isValidTimestamp && staleDays >= 1;
    const isCriticalStale = staleDays >= 2;
    const staleMessage = showStaleWarning
      ? t('activity.staleCheckinMessage', {
          name,
          count: staleDays,
          defaultValue: '{{name}} has not checked in for {{count}} days',
        })
      : '';
    const lastWelfareFollowUpHoursAgo = lastWelfareCheckSentAt
      ? Math.max(1, Math.floor((Date.now() - new Date(lastWelfareCheckSentAt).getTime()) / 3600000))
      : 0;
    const overdueCooldownHoursRemaining = overdueCooldownActive && lastWelfareCheckSentAt
      ? Math.max(1, Math.ceil(OVERDUE_WELFARE_COOLDOWN_HOURS - ((Date.now() - new Date(lastWelfareCheckSentAt).getTime()) / 3600000)))
      : 0;

    return (
      <View style={[styles.activityItem, isLast && styles.lastItem]}>
        <View style={styles.activityRow}>
          <View style={styles.leftIconsColumn}>
            <View style={styles.iconContainer}>
              {displayAvatarUrl && !avatarLoadFailed ? (
                <Image
                  source={{ uri: displayAvatarUrl }}
                  style={styles.activityAvatar}
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <Ionicons name="person-circle" size={48} color={BaseColors.neutral[300]} />
              )}
            </View>
            {capabilities.canShareLocation && (isOwner || shared_location) && (
              <TouchableOpacity
                style={styles.locationInlineButton}
                onPress={isOwner ? openCurrentLocation : openSharedLocation}
                activeOpacity={0.7}
                disabled={fetchingLocation}
              >
                {fetchingLocation ? (
                  <ActivityIndicator size="small" color={BaseColors.primaryDark} />
                ) : (
                  <Ionicons name="location" size={30} color={BaseColors.primaryDark} />
                )}
              </TouchableOpacity>
            )}
            {!isOwner && shared_location?.checkinTimeIso && (
              <Text style={styles.locationTime}>
                {new Date(shared_location.checkinTimeIso).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                  timeZone: checkin_timezone || undefined,
                })}
              </Text>
            )}
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.nameEmailRow}>
              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                {isOwner ? t('activity.you') : name}
              </Text>
            </View>

            {isNewContact ? (
              <Text style={[styles.time, styles.noCheckIn]}>
                {t('contacts.newContact')}
              </Text>
            ) : isValidTimestamp ? (
              <>
                <Animated.Text
                  style={[
                    styles.time,
                    {
                      color: timeColorAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [BaseColors.primary, BaseColors.text.dark],
                      }),
                    },
                    hasNewUpdate && { transform: [{ scale: timeScaleAnim }] },
                  ]}
                >
                  {t('activity.checkedInAt', {
                    defaultValue: 'Checked in @ {{time}} {{date}}',
                    time: timeText,
                    date: dateText,
                  })}
                </Animated.Text>
                <View style={styles.timezoneRow}>
                  <Text style={styles.timezone}>({timezoneText})</Text>
                </View>
              </>
            ) : (
              <Text style={[styles.time, styles.noCheckIn]}>
                {t('activity.noCheckIn')}
              </Text>
            )}

            {!isOwner && (isValidTimestamp || isNewContact) && (
              <>
              {(() => {
                if (reach_out_status) {
                  return (
                    <Text style={{ fontSize: 14, color: '#EF4444', marginBottom: 4 }}>
                      {t(`home.context.reachOutStatuses.${reach_out_status}` as any) as string}
                    </Text>
                  );
                }
                if (home_presence) {
                  return (
                    <Text style={{ fontSize: 14, color: BaseColors.primary, marginBottom: 4 }}>
                      {t(`home.context.homeStatuses.${home_presence}` as any) as string}
                    </Text>
                  );
                }
                if (trip_status) {
                  return (
                    <Text style={{ fontSize: 14, color: BaseColors.primary, marginBottom: 4 }}>
                      {t(`home.tripMode.statuses.${trip_status}` as any) as string}
                    </Text>
                  );
                }
                if (wellnessMeta) {
                  const parts = (t(wellnessMeta.labelKey as any) as string).split('\n');
                  return (
                    <Text style={{ fontSize: 14, color: wellnessMeta.color, marginBottom: 4 }}>
                      {parts[1] ? `${parts[1]} ` : ''}{parts[0]}
                    </Text>
                  );
                }
                return null;
              })()}
              {showStaleWarning ? (
                <View style={styles.staleWarningBlock}>
                  <Text
                    style={[
                      styles.time,
                      styles.staleCheckinText,
                      isCriticalStale ? styles.staleCheckinTextCritical : styles.staleCheckinTextWarning,
                    ]}
                  >
                    {staleMessage}
                  </Text>
                </View>
              ) : null}
              <View style={styles.responseButtonContainer}>
                <TouchableOpacity
                  style={[
                    isWelfareMode
                      ? styles.welfareButton
                      : (isTodayCheckMode || isSupportMode || isReachOutResponseMode) ? styles.todayCheckButton : styles.responseButton,
                    !isSingleActionEnabled && styles.responseButtonDisabled,
                    (sendingResponse || sendingWelfareCheck) && styles.responseButtonSending
                  ]}
                  onPress={(isTodayCheckMode || isWelfareMode) ? handleSendWelfareCheck : handleSendResponse}
                  disabled={!isSingleActionEnabled || sendingResponse || sendingWelfareCheck}
                  activeOpacity={0.7}
                >
                  {(sendingResponse || sendingWelfareCheck) ? (
                    <ActivityIndicator
                      size="small"
                      color={isWelfareMode ? BaseColors.error : BaseColors.primary}
                    />
                  ) : (isTodayCheckMode || isWelfareMode) ? (
                    (() => {
                      const label = isTodayCheckMode
                        ? (welfareCheckSent ? t('activity.todayCheckButton.sent') : t('activity.todayCheckButton.send'))
                        : overdueCooldownActive
                          ? t('activity.welfareButton.sentRecently', { defaultValue: 'Greeting sent recently' })
                          : lastWelfareCheckSentAt
                            ? t('activity.welfareButton.followUpAgain', { defaultValue: 'Follow up again' })
                            : t('activity.welfareButton.send');
                      const { text, emoji, position } = splitLabelEmoji(label);
                      const textNode = (
                        <Text style={[
                          isWelfareMode ? styles.welfareButtonText : styles.todayCheckButtonText,
                          !isSingleActionEnabled && styles.responseButtonTextDisabled
                        ]}>
                          {text}
                        </Text>
                      );
                      const emojiNode = !!emoji && (
                        <Text style={styles.welfareButtonEmoji}>{emoji}</Text>
                      );
                      return (
                        <View style={styles.welfareButtonContent}>
                          {position === 'leading' ? (
                            <>{emojiNode}{textNode}</>
                          ) : (
                            <>{textNode}{emojiNode}</>
                          )}
                        </View>
                      );
                    })()
                  ) : (
                    (() => {
                      const label = isReachOutResponseMode
                        ? (responseSent ? t('activity.reachOutResponseButton.sent') : t('activity.reachOutResponseButton.send'))
                        : isSupportMode
                          ? (responseSent ? t('activity.supportButton.sent') : t('activity.supportButton.send'))
                          : (responseSent ? t('activity.responseButton.sent') : t('activity.responseButton.sendResponse'));
                      const { text, emoji, position } = splitLabelEmoji(label);
                      const textNode = (
                        <Text style={[
                          (isSupportMode || isReachOutResponseMode) ? styles.todayCheckButtonText : styles.responseButtonText,
                          !isSingleActionEnabled && styles.responseButtonTextDisabled
                        ]}>
                          {text}
                        </Text>
                      );
                      const emojiNode = !!emoji && (
                        <Text style={styles.welfareButtonEmoji}>{emoji}</Text>
                      );
                      return (
                        <View style={styles.welfareButtonContent}>
                          {position === 'leading' ? (
                            <>{emojiNode}{textNode}</>
                          ) : (
                            <>{textNode}{emojiNode}</>
                          )}
                        </View>
                      );
                    })()
                  )}
                </TouchableOpacity>
                {isWelfareMode && lastWelfareCheckSentAt ? (
                  <Text style={[
                    styles.followUpMetaText,
                    overdueCooldownActive ? styles.followUpMetaTextMuted : styles.followUpMetaTextReady,
                  ]}>
                    {overdueCooldownActive ? t('activity.welfareButton.sentRecentlyMeta', {
                      count: lastWelfareFollowUpHoursAgo,
                      defaultValue: 'Last greeting sent {{count}} hours ago',
                    }) : t('activity.welfareButton.followUpAvailable', {
                      defaultValue: 'You can follow up again',
                    })}
                  </Text>
                ) : null}
                {isWelfareMode && overdueCooldownActive ? (
                  <Text style={[styles.followUpMetaText, styles.followUpMetaTextMuted]}>
                    {t('activity.welfareButton.followUpIn', {
                      count: overdueCooldownHoursRemaining,
                      defaultValue: 'Follow up again in {{count}}h',
                    })}
                  </Text>
                ) : null}
              </View>
              </>
            )}
          </View>

          {!!(username || trip_status || (home_presence && capabilities.isPlus) || (reach_out_status && capabilities.isPlus) || (wellnessMeta && capabilities.isPlus)) && (
            <View style={styles.rightColumn}>
              {username && (
                <Text style={styles.usernameText} numberOfLines={1} ellipsizeMode="tail">
                  @{username}
                </Text>
              )}
              {wellnessMeta && capabilities.isPlus && (
                <View style={styles.wellnessBadgeWrapper}>
                  {wellnessTooltipVisible && (
                    <View style={[styles.wellnessTooltip, { borderColor: wellnessMeta.borderColor, backgroundColor: wellnessMeta.backgroundColor }]}>
                      <Text style={[styles.wellnessTooltipText, { color: wellnessMeta.color }]}>
                        {(t(wellnessMeta.labelKey as any) as string).split('\n')[0]}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      if (wellnessTooltipTimerRef.current) clearTimeout(wellnessTooltipTimerRef.current);
                      setWellnessTooltipVisible(v => {
                        if (!v) {
                          wellnessTooltipTimerRef.current = setTimeout(() => setWellnessTooltipVisible(false), 3000);
                        }
                        return !v;
                      });
                    }}
                    style={[styles.wellnessBadge, { backgroundColor: wellnessMeta.backgroundColor, borderColor: wellnessMeta.borderColor }]}
                  >
                    <Ionicons name="heart" size={30} color={wellnessMeta.color} />
                  </Pressable>
                </View>
              )}
              {trip_status && (
                <View style={styles.wellnessBadgeWrapper}>
                  {tripTooltipVisible && (
                    <View style={[styles.wellnessTooltip, { borderColor: BaseColors.primaryBorder, backgroundColor: BaseColors.primaryLight }]}>
                      <Text style={[styles.wellnessTooltipText, { color: BaseColors.primary }]}>
                        {(() => {
                          const label = t(`home.tripMode.statuses.${trip_status}` as any) as string;
                          const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                          return m ? label.slice(m[0].length).trim() : label;
                        })()}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      if (tripTooltipTimerRef.current) clearTimeout(tripTooltipTimerRef.current);
                      setTripTooltipVisible(v => {
                        if (!v) {
                          tripTooltipTimerRef.current = setTimeout(() => setTripTooltipVisible(false), 3000);
                        }
                        return !v;
                      });
                    }}
                    style={[styles.wellnessBadge, styles.tripEmojiBadge]}
                  >
                    <Text style={styles.tripEmojiText}>
                      {(() => {
                        const label = t(`home.tripMode.statuses.${trip_status}` as any) as string;
                        const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                        return m?.[0] ?? '✈️';
                      })()}
                    </Text>
                  </Pressable>
                </View>
              )}
              {!trip_status && reach_out_status && capabilities.isPlus && (
                <>
                  <View style={styles.wellnessBadgeWrapper}>
                    {wellnessTooltipVisible && (
                      <View style={[styles.wellnessTooltip, { borderColor: '#EF4444', backgroundColor: '#FEE2E2' }]}>
                        <Text style={[styles.wellnessTooltipText, { color: '#EF4444' }]}>
                          {(() => {
                            const label = t('home.context.reachOutTab') as string;
                            const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                            return m ? label.slice(m[0].length).trim() : label;
                          })()}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => {
                        if (wellnessTooltipTimerRef.current) clearTimeout(wellnessTooltipTimerRef.current);
                        setWellnessTooltipVisible(v => {
                          if (!v) wellnessTooltipTimerRef.current = setTimeout(() => setWellnessTooltipVisible(false), 3000);
                          return !v;
                        });
                      }}
                      style={[styles.wellnessBadge, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}
                    >
                      <Ionicons name="heart" size={30} color="#EF4444" />
                    </Pressable>
                  </View>
                  <View style={styles.wellnessBadgeWrapper}>
                    {reachOutTooltipVisible && (
                      <View style={[styles.wellnessTooltip, { borderColor: '#EF4444', backgroundColor: '#FEE2E2' }]}>
                        <Text style={[styles.wellnessTooltipText, { color: '#EF4444' }]}>
                          {(() => {
                            const label = t(`home.context.reachOutStatuses.${reach_out_status}` as any) as string;
                            const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                            return m ? label.slice(m[0].length).trim() : label;
                          })()}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => {
                        if (reachOutTooltipTimerRef.current) clearTimeout(reachOutTooltipTimerRef.current);
                        setReachOutTooltipVisible(v => {
                          if (!v) reachOutTooltipTimerRef.current = setTimeout(() => setReachOutTooltipVisible(false), 3000);
                          return !v;
                        });
                      }}
                      style={[styles.wellnessBadge, styles.tripEmojiBadge]}
                    >
                      <Text style={styles.tripEmojiText}>
                        {(() => {
                          const label = t(`home.context.reachOutStatuses.${reach_out_status}` as any) as string;
                          const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                          return m?.[0] ?? '🙏';
                        })()}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
              {!trip_status && !reach_out_status && home_presence && capabilities.isPlus && (
                <View style={styles.wellnessBadgeWrapper}>
                  {homePresenceTooltipVisible && (
                    <View style={[styles.wellnessTooltip, { borderColor: BaseColors.primaryBorder, backgroundColor: BaseColors.primaryLight }]}>
                      <Text style={[styles.wellnessTooltipText, { color: BaseColors.primary }]}>
                        {(() => {
                          const label = t(`home.context.homeStatuses.${home_presence}` as any) as string;
                          const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                          return m ? label.slice(m[0].length).trim() : label;
                        })()}
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => {
                      if (homePresenceTooltipTimerRef.current) clearTimeout(homePresenceTooltipTimerRef.current);
                      setHomePresenceTooltipVisible(v => {
                        if (!v) {
                          homePresenceTooltipTimerRef.current = setTimeout(() => setHomePresenceTooltipVisible(false), 3000);
                        }
                        return !v;
                      });
                    }}
                    style={[styles.wellnessBadge, styles.tripEmojiBadge]}
                  >
                    <Text style={styles.tripEmojiText}>
                      {(() => {
                        const label = t(`home.context.homeStatuses.${home_presence}` as any) as string;
                        const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                        return m?.[0] ?? '🏠';
                      })()}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

        </View>
      </View>
    );
  };

  const stripSenderPrefix = (body: string, senderName?: string) => {
    const trimmed = body.trim();
    if (!senderName) return trimmed;
    const escapedName = senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return trimmed.replace(new RegExp(`^${escapedName}\\s*[:：]\\s*`), '');
  };

  const parseNotificationMessage = (body: string, senderName?: string) => {
    const trimmed = body.trim();
    if (!senderName) {
      return { leadingMark: '', name: '', content: trimmed };
    }

    const escapedName = senderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = trimmed.match(new RegExp(`^([^\\p{L}\\p{N}]*)\\s*(${escapedName})\\s*[:：]?\\s*(.*)$`, 'u'));

    if (!match) {
      return { leadingMark: '', name: '', content: trimmed };
    }

    return {
      leadingMark: (match[1] || '').trim(),
      name: match[2] || '',
      content: (match[3] || '').trim(),
    };
  };

  // ============================================
  // Render
  // ============================================
  const todayLikeResponses = todayResponses.filter((response) => response.type === 'checkin_response');
  const todayWelfareResponses = todayResponses.filter((response) => response.type === 'welfare_check');
  const todayEmergencyMessages = todayResponses.filter((response) => response.type === 'emergency_message');

  return (
    <SafeAreaView style={styles.mainContainer} edges={['top']}>
      <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim }]}>
        <ScreenHeader
          title={t('activity.title')}
          subtitle={t('activity.subtitle')}
          iconName="pulse"
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={BaseColors.primary} />
              <Text style={styles.loadingText}>{t('activity.loading')}</Text>
            </View>
          ) : (
            <>
              {ownerActivity && (
                <View style={styles.ownerCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="person-circle" size={ICON_SIZES.SM} color={BaseColors.primary} />
                    <Text style={styles.cardTitle}>{t('activity.you')}</Text>
                    <View style={styles.streakBadge}>
                      <Ionicons name="flame" size={14} color={BaseColors.warning} />
                      <Text style={styles.streakBadgeText}>
                        {t('home.streak')} · {t('home.days', { count: streak })}
                      </Text>
                    </View>
                    {todayResponses.length > 0 && (
                      <View style={styles.responseBadge}>
                        <Ionicons
                          name={todayWelfareResponses.length > 0 && todayLikeResponses.length === 0 ? 'help-circle' : 'heart'}
                          size={14}
                          color={todayWelfareResponses.length > 0 && todayLikeResponses.length === 0 ? BaseColors.error : BaseColors.primary}
                        />
                        <Text style={styles.responseBadgeText}>{todayResponses.length}</Text>
                      </View>
                    )}
                  </View>

                  <ActivityItem
                    name={ownerActivity.display_name}
                    avatarUrl={ownerActivity.avatar_url}
                    username={ownerActivity.username}
                    timestamp={ownerActivity.last_checked_in_utc}
                    priority={ownerActivity.priority}
                    wellness_score={ownerActivity.wellness_score}
                    trip_status={ownerActivity.trip_status}
                    home_presence={ownerActivity.home_presence}
                    reach_out_status={ownerActivity.reach_out_status}
                    isOwner
                    hasNewUpdate={ownerActivity.hasNewUpdate}
                    userId={ownerActivity.user_id}
                    checkin_timezone={ownerActivity.checkin_timezone}
                    checkin_timezone_label={ownerActivity.checkin_timezone_label}
                    shared_location={ownerActivity.shared_location}
                    isLast
                  />

                  {todayEmergencyMessages.length > 0 && (
                    <View style={styles.todayResponses}>
                      <Text style={styles.todayResponsesTitle}>
                        {t("activity.emergencyMessage.todayMessages", { count: todayEmergencyMessages.length })}
                      </Text>
                      {todayEmergencyMessages.map((response) => {
                        const senderName = response.sender?.display_name;
                        const messageText = response.data?.message || stripSenderPrefix(response.body || response.title || '', senderName);
                        return (
                        <View key={response.id} style={styles.todayResponseItem}>
                          <Ionicons name="warning" size={16} color={BaseColors.error} />
                          <Text style={styles.todayResponseText}>
                            {senderName ? (
                              <>
                                <Text style={styles.todayResponseName}>{senderName}</Text>
                                {`: ${messageText}`}
                              </>
                            ) : (
                              messageText
                            )}
                          </Text>
                          <Text style={styles.responseTimeRight}>
                            {new Date(response.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </Text>
                          {!response.read && <View style={styles.smallUnreadDot} />}
                        </View>
                        );
                      })}
                    </View>
                  )}

                  {todayWelfareResponses.length > 0 && (
                    <View style={styles.todayResponses}>
                      <Text style={styles.todayResponsesTitle}>
                        {t("activity.welfareCheck.todayGreetings", { count: todayWelfareResponses.length })}
                      </Text>
                      {todayWelfareResponses.map((response) => {
                        const senderName = response.sender?.display_name;
                        const body = stripSenderPrefix(response.body || response.title || '', senderName);
                        return (
                        <View key={response.id} style={styles.todayResponseItem}>
                          <Ionicons name="heart" size={16} color={BaseColors.primary} />
                          <Text style={styles.todayResponseText}>
                            {senderName ? (
                              <>
                                <Text style={styles.todayResponseName}>{senderName}</Text>
                                {`: ${body}`}
                              </>
                            ) : (
                              body
                            )}
                          </Text>
                          <Text style={styles.responseTimeRight}>
                            {new Date(response.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </Text>
                          {!response.read && <View style={styles.smallUnreadDot} />}
                        </View>
                        );
                      })}
                    </View>
                  )}

                  {todayLikeResponses.length > 0 && (
                    <View style={styles.todayResponses}>
                      <Text style={styles.todayResponsesTitle}>
                        {t("activity.checkinResponse.todayLikes", { count: todayLikeResponses.length })}
                      </Text>
                      {todayLikeResponses.map((response) => {
                        const parsed = parseNotificationMessage(response.body || response.title, response.sender?.display_name);
                        return (
                        <View key={response.id} style={styles.todayResponseItem}>
                          <Ionicons
                            name={response.data?.responseKind === 'reach_out' ? 'hand-left' : response.data?.responseKind === 'support' ? 'heart' : 'happy-outline'}
                            size={16}
                            color={BaseColors.primary}
                          />
                          <Text style={styles.todayResponseText}>
                            {parsed.name ? (
                              <>
                                <Text style={styles.todayResponseName}>{parsed.name}</Text>
                                {`: ${parsed.content}`}
                              </>
                            ) : (
                              response.body || response.title
                            )}
                          </Text>
                          <Text style={styles.responseTimeRight}>
                            {new Date(response.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </Text>
                          {!response.read && <View style={styles.smallUnreadDot} />}
                        </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.contactsCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={ICON_SIZES.SM} color={BaseColors.primary} />
                  <Text style={styles.cardTitle}>{t('activity.contacts')}</Text>
                  {activities.length > 0 && (
                    <View style={styles.contactCount}>
                      <Text style={styles.contactCountText}>{activities.length}</Text>
                    </View>
                  )}
                </View>

                {activities.length > 0 ? (
                  activities.map((item, index) => (
                    <ActivityItem
                      key={item.user_id}
                      name={item.display_name}
                      avatarUrl={item.avatar_url}
                      username={item.username}
                      timestamp={item.last_checked_in_utc}
                      priority={item.priority}
                      wellness_score={item.wellness_score}
                      trip_status={item.trip_status}
                      home_presence={item.home_presence}
                      reach_out_status={item.reach_out_status}
                      isOwner={false}
                      hasNewUpdate={item.hasNewUpdate}
                      userId={item.user_id}
                      checkin_timezone={item.checkin_timezone}
                      checkin_timezone_label={item.checkin_timezone_label}
                      action_state={item.action_state}
                      recency_status={item.recency_status}
                      shared_location={item.shared_location}
                      isNewContact={item.isNewContact}
                      isLast={index === activities.length - 1}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={64} color={BaseColors.neutral[300]} />
                    <Text style={styles.emptyStateTitle}>{t('activity.emptyState.title')}</Text>
                    <Text style={styles.emptyStateText}>{t('activity.emptyState.message')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.bottomSpacing} />
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// Styles remain exactly as they were in your original code
const styles = StyleSheet.create({
  // ... (keep all your existing styles exactly as they were)
  mainContainer: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  contentWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 12,
    fontSize: iosFontSize(14),
    color: BaseColors.text.light,
  },
  ownerCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: BaseColors.surface,
    borderRadius: 12,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  contactsCard: {
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: BaseColors.surface,
    borderRadius: 12,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BaseColors.neutral[200],
  },
  cardTitle: {
    fontWeight: '600',
    fontSize: iosFontSize(16),
    marginLeft: 6,
    flex: 1,
    color: BaseColors.text.dark,
  },
  contactCount: {
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCountText: {
    fontSize: iosFontSize(11),
    fontWeight: '600',
    color: BaseColors.primary,
  },
  bottomSpacing: {
    height: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: iosFontSize(18),
    fontWeight: '600',
    color: BaseColors.text.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: iosFontSize(14),
    color: BaseColors.text.light,
    textAlign: 'center',
    lineHeight: 20,
  },
  leftIconsColumn: {
    width: 56,
    marginRight: 12,
    alignItems: 'center',
    gap: 6,
  },
  tripEmojiBadge: {
    backgroundColor: BaseColors.primaryLight,
    borderColor: BaseColors.primaryBorder,
  },
  tripEmojiText: {
    fontSize: 26,
  },
  wellnessBadgeWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  wellnessBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellnessTooltip: {
    position: 'absolute',
    bottom: 64,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 120,
    maxWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  wellnessTooltipText: {
    fontSize: iosFontSize(13),
    fontWeight: '600',
    textAlign: 'center',
  },
  locationTime: {
    fontSize: iosFontSize(10),
    color: BaseColors.neutral[400],
    textAlign: 'center',
  },
  iconContainer: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  activityAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: BaseColors.primaryLight,
    backgroundColor: BaseColors.neutral[100],
  },
  statusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderRadius: 12,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BaseColors.background,
  },
  contentContainer: {
    flex: 1,
  },
  nameEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: iosFontSize(16),
    fontWeight: '600',
    color: BaseColors.text.dark,
    flex: 1,
    marginRight: 8,
  },
  email: {
    fontSize: iosFontSize(12),
    color: BaseColors.neutral[400],
    flexShrink: 1,
  },
  rightColumn: {
    width: 60,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
    gap: 6,
  },
  usernameText: {
    fontSize: iosFontSize(11),
    color: BaseColors.neutral[400],
    textAlign: 'right',
    marginBottom: 10,
  },
  timezone: {
    fontSize: iosFontSize(15),
    color: BaseColors.primary,
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 10,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  wellnessEmoji: {
    fontSize: 22,
  },
  locationInlineButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    backgroundColor: BaseColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontSize: iosFontSize(15),
    fontWeight: '600',
    color: BaseColors.text.dark,
    marginBottom: 2,
  },
  noCheckIn: {
    color: BaseColors.text.light,
    fontSize: iosFontSize(14),
    fontStyle: 'italic',
  },
  staleCheckinText: {
    marginBottom: 4,
  },
  staleCheckinTextWarning: {
    color: '#B45309',
    fontWeight: '700',
  },
  staleCheckinTextCritical: {
    color: BaseColors.error,
    fontWeight: '800',
  },
  staleWarningBlock: {
    marginTop: 2,
    marginBottom: 6,
  },
  followUpMetaText: {
    fontSize: iosFontSize(12),
    marginTop: 6,
    marginBottom: 2,
  },
  followUpMetaTextMuted: {
    color: BaseColors.neutral[500],
  },
  followUpMetaTextReady: {
    color: BaseColors.primaryDark,
    fontWeight: '600',
  },
  responseButtonContainer: {
    marginTop: 4,
  },
  responseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.primaryLight || '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BaseColors.primary,
  },
  responseButtonDisabled: {
    backgroundColor: BaseColors.neutral[200],
    borderColor: BaseColors.neutral[400],
    opacity: 0.7,
  },
  responseButtonSending: {
    opacity: 0.7,
  },
  responseButtonText: {
    fontSize: iosFontSize(13),
    fontWeight: '600',
    color: BaseColors.primary,
  },
  responseButtonTextDisabled: {
    color: BaseColors.neutral[500],
  },
  welfareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BaseColors.error,
    marginBottom: 8,
  },
  todayCheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.warningLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#B45309',
    marginBottom: 8,
  },
  welfareButtonText: {
    fontSize: iosFontSize(13),
    fontWeight: '600',
    color: BaseColors.error,
  },
  todayCheckButtonText: {
    fontSize: iosFontSize(13),
    fontWeight: '600',
    color: '#B45309',
  },
  welfareButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  welfareButtonEmoji: {
    fontSize: iosFontSize(17),
  },
  activityItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BaseColors.neutral[200],
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  activityRow: {
    flexDirection: 'row',
  },
  responseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginRight: 8,
  },
  streakBadgeText: {
    fontSize: iosFontSize(12),
    fontWeight: '600',
    color: BaseColors.warning,
  },
  responseBadgeText: {
    fontSize: iosFontSize(12),
    fontWeight: '600',
    color: BaseColors.primary,
  },
  todayResponses: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BaseColors.neutral[200],
  },
  todayResponsesTitle: {
    fontSize: iosFontSize(16),
    fontWeight: '700',
    color: BaseColors.text.dark,
    marginBottom: 10,
  },
  todayResponseItem: {
    marginLeft: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
    justifyContent: 'space-between',
  },
  responseTimeRight: {
    fontSize: iosFontSize(15),
    color: BaseColors.neutral[400],
    marginLeft: 8,
    minWidth: 45,
    textAlign: 'right',
  },
  todayResponseText: {
    flex: 1,
    fontSize: iosFontSize(14),
    color: BaseColors.primary,
  },
  todayResponseName: {
    fontWeight: '600',
    color: BaseColors.primary,
  },
  greetingMark: {
    fontSize: iosFontSize(18),
    fontWeight: '700',
    color: BaseColors.primary,
    width: 16,
    textAlign: 'center',
  },
  smallUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BaseColors.primary,
  },
  responseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: BaseColors.background,
  },
  responseItemUnread: {
    backgroundColor: BaseColors.primaryLight + '20',
    borderLeftWidth: 3,
    borderLeftColor: BaseColors.primary,
  },
  responseIcon: {
    width: 40,
    alignItems: 'center',
  },
  responseContent: {
    flex: 1,
    marginLeft: 8,
  },
  responseText: {
    fontSize: iosFontSize(14),
    color: BaseColors.text.dark,
    lineHeight: 20,
  },
  responseSender: {
    fontWeight: '600',
    color: BaseColors.primary,
  },
  responseTime: {
    fontSize: iosFontSize(11),
    color: BaseColors.neutral[400],
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BaseColors.primary,
    marginLeft: 8,
  },
});
