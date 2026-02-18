// screens/ActivityScreen.tsx
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
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

export default function ActivityScreen() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactMap, setContactMap] = useState<
    Map<string, { email: string; display_name: string }>
  >(new Map());

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastCheckinTimes = useRef<Map<string, string>>(new Map());
  const myContactIds = useRef<string[]>([]);
  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const ownerCheckinsChannelRef = useRef<any>(null);
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

      fetchActivities(); // Your fetch function
    }, [])
  );








  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

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
        console.error(t('activity.errors.fetchOwnerActivity'), error);
        return;
      }

      console.log('Raw data from users_latest_checkin:', data); // Add this

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
          fetchActivities(); // Your activity fetch function
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [fetchActivities]); // Add dependencies

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

  const initialize = async (force = false) => {
    if (isInitialized.current && !force) return;
    isInitialized.current = true;

    lastCheckinTimes.current.clear();
    await fetchActivities();
    setupContactsSubscription();
    setupCheckinsSubscription();
    setupOwnerCheckinsSubscription();
  };

  const handleScreenFocus = useCallback(() => {
    isFocused.current = true;
    if (isInitialized.current) fetchActivities();
    else initialize();
  }, []);

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
      isInitialized.current = false;
      lastCheckinTimes.current.clear();
    };
  }, []);

  // ActivityItem Component (reusable within this file)
  // ActivityItem Component
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
    const timeScaleAnim = useRef(new Animated.Value(1)).current;
    const timeColorAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (hasNewUpdate && timestamp) {
        timeScaleAnim.setValue(1);
        timeColorAnim.setValue(0);

        Animated.parallel([
          Animated.sequence([
            Animated.timing(timeScaleAnim, {
              toValue: 1.1,
              duration: 150,
              useNativeDriver: true
            }),
            Animated.delay(700),
            Animated.timing(timeScaleAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true
            }),
          ]),
          Animated.sequence([
            Animated.timing(timeColorAnim, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true
            }),
            Animated.delay(700),
            Animated.timing(timeColorAnim, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true
            }),
          ]),
        ]).start();
      }
    }, [hasNewUpdate, timestamp]);

    // Format time
    const formatActivityTime = (timestamp: string | null, timezone?: string | null) => {
      let timeText = '';
      let dateText = '';
      let timezoneText = '';
      const isValidTimestamp = timestamp && !isNaN(new Date(timestamp).getTime());

      if (isValidTimestamp) {
        try {
          const d = new Date(timestamp!);
          const tz = timezone || 'UTC';

          timeText = d.toLocaleTimeString(t('activity.time.locale'), {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz,
          });

          const weekday = d
            .toLocaleDateString(t('activity.time.locale'), {
              weekday: 'short',
              timeZone: tz,
            })
            .replace('.', '');

          const dayOfMonth = d.getDate();
          const monthName = d.toLocaleDateString(t('activity.time.locale'), {
            month: 'short',
            timeZone: tz,
          });

          dateText = `${weekday}, ${dayOfMonth} ${monthName}`;

          const parts = tz.split('/');
          timezoneText = parts.length > 1 ? parts[parts.length - 1] : tz;
        } catch (error) {
          console.error('Error formatting time:', error);
          const d = new Date(timestamp!);
          timeText = d.toLocaleTimeString(t('activity.time.locale'), {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
          });

          const weekday = d
            .toLocaleDateString(t('activity.time.locale'), { weekday: 'short' })
            .replace('.', '');
          const dayOfMonth = d.getDate();
          const monthName = d.toLocaleDateString(t('activity.time.locale'), { month: 'long' });
          dateText = `${weekday} ${dayOfMonth} ${monthName}`;
          timezoneText = timezone || 'UTC';
        }
      }

      return { timeText, dateText, timezoneText, isValidTimestamp };
    };

    const { timeText, dateText, timezoneText, isValidTimestamp } = formatActivityTime(timestamp, checkin_timezone);

    return (
      <View style={[styles.activityItem, isLast && styles.lastItem]}>
        <View style={styles.activityRow}>
          {isOwner ? (
            <View style={styles.iconPlaceholder} />
          ) : (
            <Ionicons
              name="person"
              size={20}
              color={BaseColors.primary}
              style={styles.icon}
            />
          )}

          <View style={styles.contentContainer}>
            {!isOwner && (
              <View style={styles.nameEmailRow}>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                  {name}
                </Text>
                {email && (
                  <Text style={styles.email} numberOfLines={1} ellipsizeMode="tail">
                    {email}
                  </Text>
                )}
              </View>
            )}

            {isValidTimestamp ? (
              <View style={styles.timeContainer}>
                <Animated.View style={styles.timeWithTimezone}>
                  <Animated.Text
                    style={[
                      styles.time,
                      {
                        color: timeColorAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [BaseColors.text.dark, BaseColors.primary],
                        }),
                      },
                      hasNewUpdate && { transform: [{ scale: timeScaleAnim }] },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {timeText}
                  </Animated.Text>
                  <Text style={styles.timezone} numberOfLines={1}>
                    ({timezoneText})
                  </Text>
                </Animated.View>
                <Text style={styles.date}>{dateText}</Text>
              </View>
            ) : (
              <Text style={[styles.time, styles.noCheckIn]}>
                {t('activity.noCheckIn')}
              </Text>
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
  activityItem: {
    paddingVertical: 8,
  },
  lastItem: {
    marginBottom: 0,
    paddingBottom: 0,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    marginRight: 10,
    marginTop: 2,
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
  timeContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
  },
  timeWithTimezone: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  time: {
    fontSize: 15,
    fontWeight: '600',
    color: BaseColors.text.dark,
    flexShrink: 1,
  },
  timezone: {
    fontSize: 11,
    color: BaseColors.text.light,
    fontWeight: '500',
    flexShrink: 1,
  },
  date: {
    fontSize: 13,
    fontWeight: '500',
    color: BaseColors.text.light,
  },
  noCheckIn: {
    color: BaseColors.text.light,
    fontSize: 14,
  },
  iconPlaceholder: {
    width: 20,
    marginRight: 10,
  },
});