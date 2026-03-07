// screens/ActivityScreen.tsx
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
import { useAuth } from '@/contexts/AuthContext';
import { responseService } from '@/lib/notifications/responseService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Activity = {
  user_id: string;
  display_name: string;
  last_checked_in_utc: string | null;
  priority: number;
  email?: string | null;
  contact_display_name?: string;
  is_owner?: boolean;
  hasNewUpdate?: boolean;
  checkin_timezone?: string | null;
};

// ✅ Define ResponseNotification type using your existing notifications table
type ResponseNotification = {
  id: string;
  user_id: string; // recipient
  sender_user_id: string; // sender
  type: string;
  title: string;
  body: string;
  data: {
    responseType?: string;
    checkinId?: string;
    checkinTime?: string;
    fromUserName?: string;
    toUserId?: string;
  };
  read: boolean;
  created_at: string;
  sender?: {
    display_name: string;
  };
};

export default function ActivityScreen() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactMap, setContactMap] = useState<
    Map<string, { email: string; display_name: string }>
  >(new Map());

  // State for response notifications
  const [responses, setResponses] = useState<ResponseNotification[]>([]);
  const [unreadResponses, setUnreadResponses] = useState<ResponseNotification[]>([]);
  const [showResponses, setShowResponses] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastCheckinTimes = useRef<Map<string, string>>(new Map());
  const myContactIds = useRef<string[]>([]);
  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const ownerCheckinsChannelRef = useRef<any>(null);
  const responsesChannelRef = useRef<any>(null);
  const isInitialized = useRef(false);
  const isFocused = useRef(false);
  const contactMapRef = useRef<
    Map<string, { email: string; display_name: string }>
  >(new Map());

  // Add a ref to track if this is first mount
  const isFirstMount = useRef(true);

  // ✅ Add AppState logging to see what's happening
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      console.log('📱 AppState changed to:', state, 'at:', new Date().toLocaleTimeString());
    });
    return () => subscription.remove();
  }, []);

  // ✅ Log when useFocusEffect fires
  useFocusEffect(
    useCallback(() => {
      console.log('🎯 useFocusEffect FIRED at:', new Date().toLocaleTimeString());
      console.log('📊 Current AppState:', AppState.currentState);

      if (isFirstMount.current) {
        console.log('📝 This is initial mount');
        isFirstMount.current = false;
      } else {
        console.log('🔄 This is a re-focus (tab switch or unlock?)');
      }

      fetchActivities();
      fetchUnreadResponseNotifications(); // Also fetch unread responses
    }, [])
  );

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const isTodayLocal = (dateStr: string, timezone: string): boolean => {
    try {
      const date = new Date(dateStr);
      const now = new Date();

      // Convert both to local date strings in the given timezone
      const dateLocalStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
      const nowLocalStr = now.toLocaleDateString('en-CA', { timeZone: timezone });

      return dateLocalStr === nowLocalStr;
    } catch (error) {
      console.error('Error checking if date is today:', error);
      return false;
    }
  };

  // Add state for today's responses
  const [todayResponses, setTodayResponses] = useState<ResponseNotification[]>([]);

  // Update fetchResponseNotifications to also set today's responses
  const fetchResponseNotifications = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'checkin_response')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        setResponses([]);
        setUnreadResponses([]);
        setTodayResponses([]);
        return;
      }

      const senderIds = notifications
        .map(n => n.sender_user_id)
        .filter(id => id != null);

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

      // Get user's timezone from settings or use default
      const userTimezone = ownerActivity?.checkin_timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC';

      // Enrich notifications and filter today's
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

      // Filter for today's responses using local time
      const today = enriched.filter(r =>
        isTodayLocal(r.created_at, userTimezone)
      );
      setTodayResponses(today);

      const unread = enriched.filter(r => !r.read);
      setUnreadResponses(unread);

    } catch (error) {
      console.error('Error fetching response notifications:', error);
    }
  };


  // Fetch only unread response notifications
  const fetchUnreadResponseNotifications = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      // QUERY 1: Get unread notifications with type 'checkin_response'
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'checkin_response')  // Changed from 'response' to 'checkin_response'
        .eq('read', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!notifications || notifications.length === 0) {
        setUnreadResponses([]);
        return;
      }

      // QUERY 2: Get sender profiles separately
      const senderIds = notifications
        .map(n => n.sender_user_id)
        .filter(id => id != null);

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

      // Parse JSON data and combine
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

      if (enriched.length > 0 && !showResponses) {
        console.log(`📬 You have ${enriched.length} unread responses`);
      }

    } catch (error) {
      console.error('Error fetching unread responses:', error);
    }
  };

  // Update ResponseItem component to handle the data structure
  const ResponseItem = ({ response, onPress }: { response: any; onPress: () => void }) => {
    const formattedTime = new Date(response.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const formattedDate = new Date(response.created_at).toLocaleDateString();

    // Get sender name from various possible sources
    const fromName = response.sender?.display_name ||
      response.data?.senderName ||
      'Someone';

    // Use the notification body or a default message
    const message = response.body || 'responded to your check-in';

    return (
      <TouchableOpacity
        style={[styles.responseItem, !response.read && styles.responseItemUnread]}
        onPress={onPress}
      >
        <View style={styles.responseIcon}>
          <Ionicons
            name="hand-left"
            size={24}
            color={response.read ? BaseColors.neutral[400] : BaseColors.primary}
          />
        </View>
        <View style={styles.responseContent}>
          <Text style={styles.responseText}>
            <Text style={styles.responseSender}>
              {fromName}
            </Text>
            {' '}{message}
          </Text>
          <Text style={styles.responseTime}>
            {formattedDate} at {formattedTime}
          </Text>
        </View>
        {!response.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  // Update the subscription setup
  const setupResponsesSubscription = () => {
    if (responsesChannelRef.current) {
      supabase.removeChannel(responsesChannelRef.current);
      responsesChannelRef.current = null;
    }

    supabase.auth.getUser().then(({ data: userData }) => {
      const user = userData.user;
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
            // Only process checkin_response type notifications
            if (payload.new.type === 'checkin_response') {
              console.log('📬 New response notification received:', payload.new);

              // Parse the data field
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

              const newNotification = {
                ...payload.new,
                data: parsedData,
                sender: {
                  display_name: senderName
                }
              };

              // Update state
              setResponses(prev => [newNotification, ...prev]);
              if (!payload.new.read) {
                setUnreadResponses(prev => [newNotification, ...prev]);
              }
            }
          }
        )
        .subscribe();

      responsesChannelRef.current = channel;
    });
  };

  // Update initialize function to use the fixed functions
  const initialize = async (force = false) => {
    if (isInitialized.current && !force) return;
    isInitialized.current = true;

    lastCheckinTimes.current.clear();
    await fetchActivities();
    await fetchResponseNotifications(); // Fetch response notifications
    setupContactsSubscription();
    setupCheckinsSubscription();
    setupOwnerCheckinsSubscription();
    setupResponsesSubscription(); // Setup responses subscription
  };

  const handleScreenFocus = useCallback(() => {
    isFocused.current = true;
    if (isInitialized.current) {
      fetchActivities();
      fetchUnreadResponseNotifications(); // Also refresh unread responses
    } else {
      initialize();
    }
  }, []);

  // ✅ Mark a response notification as read
  const markResponseAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      // Update local state
      setResponses(prev =>
        prev.map(r => r.id === notificationId ? { ...r, read: true } : r)
      );

      setUnreadResponses(prev => prev.filter(r => r.id !== notificationId));
    } catch (error) {
      console.error('Error marking response as read:', error);
    }
  };

  // ✅ Mark all response notifications as read
  const markAllResponsesAsRead = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user || unreadResponses.length === 0) return;

      const unreadIds = unreadResponses.map(r => r.id);

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds);

      if (error) throw error;

      // Update local state
      setResponses(prev =>
        prev.map(r => unreadIds.includes(r.id) ? { ...r, read: true } : r)
      );

      setUnreadResponses([]);
    } catch (error) {
      console.error('Error marking all responses as read:', error);
    }
  };

  const fetchContacts = async (): Promise<{
    ids: string[];
    map: Map<string, { email: string; display_name: string }>;
  }> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { ids: [], map: new Map() };

      const { data: contactsData } = await supabase
        .from('contacts')
        .select('contact_user_id, contact_email, contact_display_name')
        .eq('owner_user_id', user.id);

      if (contactsData) {
        const map = new Map<string, { email: string; display_name: string }>();
        const ids: string[] = [];

        contactsData.forEach((c) => {
          map.set(c.contact_user_id, {
            email: c.contact_email || '',
            display_name: c.contact_display_name || '',
          });
          ids.push(c.contact_user_id);
        });

        setContactMap(map);
        contactMapRef.current = map;
        myContactIds.current = ids;
        return { ids, map };
      }
    } catch (err) {
      console.error(t('activity.errors.fetchContacts'), err);
    }
    return { ids: [], map: new Map() };
  };

  const fetchOwnerActivity = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('users_latest_checkin')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error(t('activity.errors.fetchOwnerActivity' as any), error);
        return;
      }

      if (data) {
        const isNew =
          !lastCheckinTimes.current.has(user.id) ||
          lastCheckinTimes.current.get(user.id) !== data.last_checked_in_utc;

        lastCheckinTimes.current.set(user.id, data.last_checked_in_utc);

        setOwnerActivity({
          ...data,
          display_name: t('activity.you'),
          is_owner: true,
          hasNewUpdate: isNew,
          checkin_timezone: data.checkin_timezone,
        });
      } else {
        setOwnerActivity({
          user_id: user.id,
          display_name: t('activity.you'),
          last_checked_in_utc: null,
          priority: 0,
          is_owner: true,
          hasNewUpdate: false,
          checkin_timezone: null,
        });
      }
    } catch (err) {
      console.error(t('activity.errors.fetchOwnerActivity'), err);
    }
  };

  const fetchActivities = async () => {
    try {
      const { ids: contactIds, map: freshContactMap } = await fetchContacts();
      await fetchOwnerActivity();
      await fetchUnreadResponseNotifications(); // Also fetch unread responses

      if (contactIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('users_latest_checkin')
        .select('*')
        .in('user_id', contactIds)
        .order('last_checked_in_utc', { ascending: false });

      if (error) throw error;

      const enriched = (data || []).map((activity) => {
        const contactInfo = freshContactMap.get(activity.user_id);

        const isNew =
          !lastCheckinTimes.current.has(activity.user_id) ||
          lastCheckinTimes.current.get(activity.user_id) !==
          activity.last_checked_in_utc;

        if (activity.last_checked_in_utc) {
          lastCheckinTimes.current.set(
            activity.user_id,
            activity.last_checked_in_utc
          );
        }

        return {
          ...activity,
          display_name: contactInfo?.display_name || activity.display_name,
          email: contactInfo?.email || null,
          contact_display_name: contactInfo?.display_name,
          hasNewUpdate: isNew,
          checkin_timezone: activity.checkin_timezone,
        };
      });

      const sorted = enriched.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (b.last_checked_in_utc ?? '').localeCompare(
          a.last_checked_in_utc ?? ''
        );
      });

      setActivities(sorted);
    } catch (err) {
      console.error(t('activity.errors.loadActivities'), err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('📱 App became active - refreshing activity data');
        if (isMounted) {
          fetchActivities();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  // ... (keep all your existing subscription setup functions)

  const setupOwnerCheckinsSubscription = () => {
    if (ownerCheckinsChannelRef.current) {
      supabase.removeChannel(ownerCheckinsChannelRef.current);
      ownerCheckinsChannelRef.current = null;
    }

    supabase.auth.getUser().then(({ data: userData }) => {
      const user = userData.user;
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
              setOwnerActivity({
                user_id: user.id,
                display_name: t('activity.you'),
                last_checked_in_utc: null,
                priority: 0,
                is_owner: true,
                hasNewUpdate: false,
                checkin_timezone: null,
              });
              return;
            }

            if (payload.new) {
              const isNew =
                !lastCheckinTimes.current.has(user.id) ||
                lastCheckinTimes.current.get(user.id) !==
                payload.new.last_checked_in_utc;

              if (payload.new.last_checked_in_utc) {
                lastCheckinTimes.current.set(
                  user.id,
                  payload.new.last_checked_in_utc
                );
              }

              setOwnerActivity({
                user_id: payload.new.user_id,
                last_checked_in_utc: payload.new.last_checked_in_utc,
                priority: payload.new.priority,
                display_name: t('activity.you'),
                is_owner: true,
                hasNewUpdate: isNew,
                checkin_timezone: payload.new.checkin_timezone,
              });
            }
          }
        )
        .subscribe();

      ownerCheckinsChannelRef.current = channel;
    });
  };

  const setupCheckinsSubscription = () => {
    if (checkinsChannelRef.current) {
      supabase.removeChannel(checkinsChannelRef.current);
      checkinsChannelRef.current = null;
    }

    const contactIds = myContactIds.current;
    if (contactIds.length === 0) return;

    const channel = supabase
      .channel('latest-checkins-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users_latest_checkin',
          filter: `user_id=in.(${contactIds.join(',')})`,
        },
        (payload) => {
          if (!payload.new) return;

          const updated: any = payload.new;

          if (payload.eventType === 'DELETE') {
            lastCheckinTimes.current.delete(payload.old.user_id);
            setActivities((prev) =>
              prev.filter((a) => a.user_id !== payload.old.user_id)
            );
            return;
          }

          const contactInfo = contactMapRef.current.get(updated.user_id);

          const isNew =
            !lastCheckinTimes.current.has(updated.user_id) ||
            lastCheckinTimes.current.get(updated.user_id) !==
            updated.last_checked_in_utc;

          if (updated.last_checked_in_utc) {
            lastCheckinTimes.current.set(
              updated.user_id,
              updated.last_checked_in_utc
            );
          }

          const enriched = {
            ...updated,
            display_name: contactInfo?.display_name || updated.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name,
            hasNewUpdate: isNew,
            checkin_timezone: updated.checkin_timezone,
          };

          setActivities((prev) => {
            const index = prev.findIndex((a) => a.user_id === enriched.user_id);
            const newArray = [...prev];

            if (index !== -1) {
              newArray[index] = enriched;
            } else {
              newArray.push(enriched);
            }

            return newArray.sort((a, b) => {
              if (b.priority !== a.priority) return b.priority - a.priority;
              return (b.last_checked_in_utc ?? '').localeCompare(
                a.last_checked_in_utc ?? ''
              );
            });
          });
        }
      )
      .subscribe();

    checkinsChannelRef.current = channel;
  };

  const setupContactsSubscription = () => {
    if (contactsChannelRef.current) {
      supabase.removeChannel(contactsChannelRef.current);
      contactsChannelRef.current = null;
    }

    supabase.auth.getUser().then(({ data: userData }) => {
      const user = userData.user;
      if (!user) return;

      const channel = supabase
        .channel('contacts-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'contacts',
            filter: `owner_user_id=eq.${user.id}`,
          },
          async () => {
            await fetchContacts();
            setupCheckinsSubscription();
            fetchActivities();
          }
        )
        .subscribe();

      contactsChannelRef.current = channel;
    });
  };





  const handleScreenBlur = useCallback(() => {
    isFocused.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      handleScreenFocus();
      return () => handleScreenBlur();
    }, [handleScreenFocus, handleScreenBlur])
  );

  useEffect(() => {
    initialize();
    return () => {
      if (checkinsChannelRef.current)
        supabase.removeChannel(checkinsChannelRef.current);
      if (contactsChannelRef.current)
        supabase.removeChannel(contactsChannelRef.current);
      if (ownerCheckinsChannelRef.current)
        supabase.removeChannel(ownerCheckinsChannelRef.current);
      if (responsesChannelRef.current)
        supabase.removeChannel(responsesChannelRef.current);
      isInitialized.current = false;
      lastCheckinTimes.current.clear();
    };
  }, []);



  // ActivityItem Component (reusable within this file)
  const ActivityItem = ({
    name,
    email,
    timestamp,
    priority,
    isOwner = false,
    hasNewUpdate = false,
    userId,
    isLast = false,
    checkin_timezone,
  }: {
    name: string;
    email?: string | null;
    timestamp: string | null;
    priority: number;
    isOwner?: boolean;
    hasNewUpdate?: boolean;
    userId: string;
    isLast?: boolean;
    checkin_timezone?: string | null;
  }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const timeScaleAnim = useRef(new Animated.Value(1)).current;
    const timeColorAnim = useRef(new Animated.Value(0)).current;

    const [sendingResponse, setSendingResponse] = useState(false);
    const [responseSent, setResponseSent] = useState(() => {
      if (!user || !timestamp || isOwner) return false;
      const cacheKey = `${userId}_${user.id}_${timestamp}`;
      return responseService.hasCachedResponse(cacheKey);
    });

    useEffect(() => {
      const checkIfResponded = async () => {
        if (!user || !timestamp || isOwner || responseSent) return;
        const alreadyResponded = await responseService.hasResponded(
          userId,
          user.id,
          timestamp
        );
        if (alreadyResponded) {
          setResponseSent(true);
        }
      };
      checkIfResponded();
    }, [userId, user?.id, timestamp, isOwner, responseSent]);

    useFocusEffect(
      useCallback(() => {
        const checkOnFocus = async () => {
          if (!user || !timestamp || isOwner) return;
          const alreadyResponded = await responseService.hasResponded(
            userId,
            user.id,
            timestamp
          );
          setResponseSent(prev => {
            if (prev !== alreadyResponded) {
              return alreadyResponded;
            }
            return prev;
          });
        };
        checkOnFocus();
      }, [userId, user?.id, timestamp, isOwner])
    );

    const getCheckInStatus = useCallback(() => {
      if (!timestamp) {
        return {
          icon: 'help-circle-outline',
          color: BaseColors.warning || '#FFA500',
          status: 'never'
        };
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
          return {
            icon: 'checkmark-circle',
            color: BaseColors.success || '#4CAF50',
            status: 'checked-today'
          };
        }

        const yesterday = new Date(adjustedToday);
        const yesterdayParts = adjustedToday.split('-').map(Number);
        yesterday.setUTCFullYear(yesterdayParts[0], yesterdayParts[1] - 1, yesterdayParts[2] - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (adjustedLastDate === yesterdayStr) {
          return {
            icon: 'time-outline',
            color: BaseColors.warning || '#FFA500',
            status: 'yesterday'
          };
        }

        return {
          icon: 'alert-circle',
          color: BaseColors.error || '#F44336',
          status: 'older'
        };
      } catch (error) {
        return {
          icon: 'help-circle-outline',
          color: BaseColors.neutral[400],
          status: 'error'
        };
      }
    }, [timestamp]);

    const status = getCheckInStatus();
    const isButtonEnabled = status.status === 'checked-today' && !isOwner && !responseSent;

    const handleSendResponse = async () => {
      if (sendingResponse || !isButtonEnabled || !user) return;

      setSendingResponse(true);
      try {
        const alreadyResponded = await responseService.hasResponded(
          userId,
          user.id,
          timestamp || ''
        );

        if (alreadyResponded) {
          console.log('Already responded to this check-in');
          setResponseSent(true);
          return;
        }

        const result = await responseService.sendResponse({
          recipientUserId: userId,
          senderUserId: user.id,
          checkinTime: timestamp || '',
        });

        if (result.success) {
          console.log('✅ Response sent successfully!');
          setResponseSent(true);
        } else {
          console.error('Failed to send response:', result.error);
        }
      } catch (error) {
        console.error('Error sending response:', error);
      } finally {
        setSendingResponse(false);
      }
    };

    const formatActivityTime = (timestamp: string | null, timezone?: string | null) => {
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
            dateText = t('activity.day.today') || 'Today';
          } else if (dLocalStr === yesterdayLocalStr) {
            dateText = t('activity.day.yesterday') || 'Yesterday';
          } else {
            const weekday = d.toLocaleDateString(t('activity.time.locale'), {
              weekday: 'short',
              timeZone: tz,
            }).replace('.', '');

            const dayOfMonth = d.getDate();
            const monthName = d.toLocaleDateString(t('activity.time.locale'), {
              month: 'short',
              timeZone: tz,
            });

            dateText = `${weekday}, ${dayOfMonth} ${monthName}`;
          }

          const parts = tz.split('/');
          timezoneText = parts.length > 1 ? parts[parts.length - 1] : tz;

        } catch (error) {
          console.error('Error formatting time:', error);
        }
      }

      return { timeText, dateText, timezoneText, isValidTimestamp };
    };

    const { timeText, dateText, timezoneText, isValidTimestamp } = formatActivityTime(timestamp, checkin_timezone);

    return (
      <View style={[styles.activityItem, isLast && styles.lastItem]}>
        <View style={styles.activityRow}>
          {/* Left column with person icon and status badge */}
          <View style={styles.leftIconsColumn}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="person-circle"
                size={48}
                color={BaseColors.primary}
              />
              <View style={[styles.statusBadge, { backgroundColor: status.color }]}>
                <Ionicons
                  name={status.icon}
                  size={14}
                  color="#FFFFFF"
                />
              </View>
            </View>
          </View>

          {/* Content area */}
          <View style={styles.contentContainer}>
            {/* Name and email row */}
            <View style={styles.nameEmailRow}>
              <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                {isOwner ? t('activity.you') : name}
              </Text>
              {!isOwner && email && (
                <Text style={styles.email} numberOfLines={1} ellipsizeMode="tail">
                  {email}
                </Text>
              )}
            </View>

            {/* Time info */}
            {isValidTimestamp ? (
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
                  numberOfLines={1}
                >
                  <Text>🎯 </Text>
                  {timeText}  {dateText}
                </Animated.Text>
                <Text style={styles.timezone}>({timezoneText})</Text>
              </>
            ) : (
              <Text style={[styles.time, styles.noCheckIn]}>
                {t('activity.noCheckIn')}
              </Text>
            )}

            {/* Response button - only for non-owner with valid check-in */}
            {!isOwner && isValidTimestamp && (
              <View style={styles.responseButtonContainer}>
                {responseSent ? (
                  <View style={[styles.responseButton]}>
                    <Text style={styles.responseButtonText}>
                      {t('activity.responseButton.responded') || 'Sent!'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.responseButton,
                      !isButtonEnabled && styles.responseButtonDisabled,
                      sendingResponse && styles.responseButtonSending
                    ]}
                    onPress={handleSendResponse}
                    disabled={!isButtonEnabled || sendingResponse}
                    activeOpacity={0.7}
                  >
                    {sendingResponse ? (
                      <ActivityIndicator size="small" color={BaseColors.primary} />
                    ) : (
                      <Text style={[
                        styles.responseButtonText,
                        !isButtonEnabled && styles.responseButtonTextDisabled
                      ]}>
                        {t('activity.responseButton.sendResponse') || 'Good job!'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.mainContainer} edges={['top']}>
      <Animated.View style={[styles.contentWrapper, { opacity: fadeAnim }]}>
        {/* Screen Header - Fixed at top */}
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
              <Text style={styles.loadingText}>
                {t('activity.loading')}
              </Text>
            </View>
          ) : (
            <>
              {/* Owner Card */}
              {ownerActivity && (
                <View style={styles.ownerCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons
                      name="person-circle"
                      size={ICON_SIZES.SM}
                      color={BaseColors.primary}
                    />
                    <Text style={styles.cardTitle}>
                      {t('activity.you')}
                    </Text>
                    {todayResponses.length > 0 && (
                      <View style={styles.responseBadge}>
                        <Ionicons name="heart" size={14} color={BaseColors.primary} />
                        <Text style={styles.responseBadgeText}>
                          {todayResponses.length}
                        </Text>
                      </View>
                    )}
                  </View>

                  <ActivityItem
                    name={ownerActivity.display_name}
                    timestamp={ownerActivity.last_checked_in_utc}
                    priority={ownerActivity.priority}
                    isOwner
                    hasNewUpdate={ownerActivity.hasNewUpdate}
                    userId={ownerActivity.user_id}
                    checkin_timezone={ownerActivity.checkin_timezone}
                    isLast
                  />

                  {/* Show today's responses under the owner's check-in */}
                  {todayResponses.length > 0 && (
                    <View style={styles.todayResponses}>
                      <Text style={styles.todayResponsesTitle}>
                        👋 {todayResponses.length} {todayResponses.length === 1 ? 'person' : 'people'} cheered you today:
                      </Text>
                      {todayResponses.map((response, index) => (
                        <View key={response.id} style={styles.todayResponseItem}>
                          <Ionicons name="heart" size={16} color={BaseColors.primary} />
                          <Text style={styles.todayResponseText}>
                            <Text style={styles.todayResponseName}>
                              {response.sender?.display_name}
                            </Text>
                            {response.body ? ` ${response.body}` : ' cheered for you!'}
                          </Text>
                          {!response.read && <View style={styles.smallUnreadDot} />}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Contacts Card */}
              <View style={styles.contactsCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={ICON_SIZES.SM} color={BaseColors.primary} />
                  <Text style={styles.cardTitle}>
                    {t('activity.contacts')}
                  </Text>
                  {activities.length > 0 && (
                    <View style={styles.contactCount}>
                      <Text style={styles.contactCountText}>
                        {activities.length}
                      </Text>
                    </View>
                  )}
                </View>

                {activities.length > 0 ? (
                  activities.map((item, index) => (
                    <ActivityItem
                      key={item.user_id}
                      name={item.display_name}
                      email={item.email}
                      timestamp={item.last_checked_in_utc}
                      priority={item.priority}
                      isOwner={false}
                      hasNewUpdate={item.hasNewUpdate}
                      userId={item.user_id}
                      checkin_timezone={item.checkin_timezone}
                      isLast={index === activities.length - 1}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="people-outline"
                      size={64}
                      color={BaseColors.neutral[300]}
                    />
                    <Text style={styles.emptyStateTitle}>
                      {t('activity.emptyState.title')}
                    </Text>
                    <Text style={styles.emptyStateText}>
                      {t('activity.emptyState.message')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Bottom spacing */}
              <View style={styles.bottomSpacing} />
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: BaseColors.background,
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
    fontSize: 14,
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
  responsesCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: BaseColors.surface,
    borderRadius: 12,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  responsesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BaseColors.neutral[200],
  },
  responsesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  responsesHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  responsesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: BaseColors.text.dark,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: BaseColors.primary,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  markAllReadButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  markAllReadText: {
    fontSize: 12,
    color: BaseColors.primary,
    fontWeight: '500',
  },
  responsesList: {
    padding: 16,
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
    fontSize: 14,
    color: BaseColors.text.dark,
    lineHeight: 20,
  },
  responseSender: {
    fontWeight: '600',
    color: BaseColors.primary,
  },
  responseTime: {
    fontSize: 11,
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
  noResponsesText: {
    textAlign: 'center',
    color: BaseColors.neutral[400],
    padding: 20,
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
    fontSize: 16,
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
    fontSize: 11,
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
    fontSize: 18,
    fontWeight: '600',
    color: BaseColors.text.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: BaseColors.text.light,
    textAlign: 'center',
    lineHeight: 20,
  },
  icon: {
    marginRight: 10,
    marginTop: 2,
  },
  leftIconsStack: {
    flexDirection: 'column',
    alignItems: 'center',
    width: 30,
    marginRight: 10,
  },
  leftIconsColumn: {
    width: 48,
    marginRight: 12,
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    width: 48,
    height: 48,
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
  ownerPlaceholder: {
    width: 48,
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  nameEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: BaseColors.text.dark,
    flex: 1,
    marginRight: 8,
  },
  email: {
    fontSize: 12,
    color: BaseColors.neutral[400],
    flexShrink: 1,
  },
  date: {
    fontSize: 13,
    color: BaseColors.primary,
    marginBottom: 8,
    fontWeight: '500',
  },
  timezone: {
    fontSize: 15,
    color: BaseColors.primary,
    marginBottom: 8,
    fontWeight: '500',
  },
  time: {
    fontSize: 15,
    fontWeight: '600',
    color: BaseColors.text.dark,
    marginBottom: 2,
  },
  noCheckIn: {
    color: BaseColors.text.light,
    fontSize: 14,
    fontStyle: 'italic',
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
  },
  responseButtonSending: {
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 6,
  },
  responseButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BaseColors.primary,
  },
  responseButtonTextDisabled: {
    color: BaseColors.neutral[400],
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
  // Add to your StyleSheet
  responseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  responseBadgeText: {
    fontSize: 12,
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
    fontSize: 13,
    fontWeight: '600',
    color: BaseColors.text.dark,
    marginBottom: 8,
  },
  todayResponseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  todayResponseText: {
    flex: 1,
    fontSize: 14,
    color: BaseColors.text.dark,
  },
  todayResponseName: {
    fontWeight: '600',
    color: BaseColors.primary,
  },
  smallUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BaseColors.primary,
  },
});