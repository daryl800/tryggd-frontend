// app/(tabs)/index.tsx 
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { useStreak } from '@/hooks/useStreak';
import { sendCheckinNotification } from '@/lib/api/checkinApi';
import {
  cancelTodayReminderAfterCheckin
} from '@/lib/notifications/reminderManager';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  AppState,
  Dimensions,
  PixelRatio,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CIRCLE_SIZE = Math.min(SCREEN_WIDTH * 0.7, 250);
const STROKE_WIDTH = 40;
const MAX_STROKE = STROKE_WIDTH + 3;
const CIRCLE_RADIUS = (CIRCLE_SIZE - MAX_STROKE) / 2;
const INNER_BUTTON_SIZE = CIRCLE_SIZE - STROKE_WIDTH;
const INNER_BUTTON_OFFSET = STROKE_WIDTH / 2;

const STORAGE_KEY = '@checkin_state';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const IS_IOS = Platform.OS === 'ios';

// Helper functions (keep all your existing helper functions here)
const getGreetingInfo = (date: Date, t: any): { greeting: string; iconName: string } => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12)
    return {
      greeting: t('home.greetings.morning'),
      iconName: 'sunny',
    };

  if (hour >= 12 && hour < 18)
    return {
      greeting: t('home.greetings.afternoon'),
      iconName: 'partly-sunny',
    };

  if (hour >= 18 && hour < 22)
    return {
      greeting: t('home.greetings.evening'),
      iconName: 'moon',
    };

  return {
    greeting: t('home.greetings.night'),
    iconName: 'moon',
  };
};

const formatTimeLeft = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const numberToChinese = (num: number): string => {
  const chineseNumbers = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  if (num <= 10) {
    return chineseNumbers[num];
  } else if (num <= 19) {
    return '十' + (num === 10 ? '' : chineseNumbers[num % 10]);
  } else if (num <= 29) {
    return '二十' + (num === 20 ? '' : chineseNumbers[num % 10]);
  } else if (num === 30) {
    return '三十';
  } else if (num === 31) {
    return '三十一';
  } else {
    return num.toString();
  }
};

const formatDateWithTranslation = (date: Date, t: any, language?: string) => {
  const weekdayIndex = date.getDay();
  const monthIndex = date.getMonth();
  const day = date.getDate();

  const lang = language || 'en';

  try {
    const weekdayKey = `home.dateFormats.weekdays.${weekdayIndex}`;
    const monthKey = `home.dateFormats.months.${monthIndex}`;

    const weekday = t(weekdayKey, { lng: lang });
    const month = t(monthKey, { lng: lang });

    const gotWeekday = weekday && typeof weekday === 'string' && !weekday.includes('home.dateFormats');
    const gotMonth = month && typeof month === 'string' && !month.includes('home.dateFormats');

    if (gotWeekday && gotMonth) {
      const isChinese = lang.startsWith('zh') || lang.includes('Chinese');

      if (isChinese) {
        const chineseDay = numberToChinese(day);
        const cleanMonth = month.replace('月', '');
        return `${weekday}, ${cleanMonth}月${chineseDay}号`;
      } else {
        return `${weekday}, ${day} ${month}`;
      }
    }
  } catch (error) {
    console.log('Translation attempt failed:', error);
  }

  const englishWeekdays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const englishMonths = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const weekday = englishWeekdays[weekdayIndex];
  const month = englishMonths[monthIndex];

  const isChinese = lang.startsWith('zh') || lang.includes('Chinese');
  if (isChinese) {
    const chineseDay = numberToChinese(day);
    return `${weekday}, ${month}月${chineseDay}号`;
  } else {
    return `${weekday}, ${day} ${month}`;
  }
};

const formatTime24h = (date: Date, language: string) => {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    sv: 'sv-SE',
    no: 'nb-NO',
    da: 'da-DK',
    fi: 'fi-FI',
    'zh-Hans': 'zh_Hans',
    'zh-Hant': 'zh_Hant',
    zh: 'zh-CN',
  };

  const locale = localeMap[language] || 'en-US';

  try {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch (error) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
};

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, profile, loading } = useAuth();

  // State
  const [now, setNow] = useState(new Date());
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [lastCheckinUtc, setLastCheckinUtc] = useState<string | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const { streak, loading: streakLoading, refetch: refetchStreak } = useStreak();
  const [showResetButton, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [fontScale, setFontScale] = useState(1);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

  const [contactsCount, setContactsCount] = useState(0);

  useEffect(() => {
    setFontScale(PixelRatio.getFontScale());
  }, []);

  const fetchContactsCount = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { count, error } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_user_id', user.id);

    if (!error) {
      setContactsCount(count || 0);
    }
  }, []);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Heart beat animation when not checked in
  useEffect(() => {
    if (!checkedInToday && !isInitialLoad) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      const heartBeat = Animated.loop(
        Animated.sequence([
          Animated.timing(heartBeatAnim, {
            toValue: 1.15,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(heartBeatAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(1000),
        ])
      );
      heartBeat.start();

      return () => {
        pulse.stop();
        heartBeat.stop();
      };
    }
  }, [checkedInToday, isInitialLoad]);

  // Success animation when checked in
  useEffect(() => {
    if (checkedInToday) {
      Animated.spring(successScaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }).start();
      heartBeatAnim.setValue(1);
    } else {
      successScaleAnim.setValue(0);
    }
  }, [checkedInToday]);

  const triggerCheckInAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.timing(heartBeatAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(heartBeatAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Handle notification responses
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { type, isBackup } = response.notification.request.content.data;

      if (type === 'self_reminder_backup' && isBackup) {
        console.log('Backup notification tapped');
        fetchLastCheckin();
      }
    });

    return () => subscription.remove();
  }, []);

  const resetAllState = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCheckedInToday(false);
    setLastCheckinUtc(null);
    setLastCheckinId(null);
    setShowResetButton(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const checkDateAndReset = useCallback(() => {
    if (!lastCheckinUtc) return;

    const lastCheckinDate = new Date(lastCheckinUtc);
    const today = new Date();

    if (!isSameDay(lastCheckinDate, today)) {
      resetAllState();
      refetchStreak();
    }
  }, [lastCheckinUtc, resetAllState, refetchStreak]);

  const fetchLastCheckin = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('users_latest_checkin')
      .select('last_checked_in_utc')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error(t('home.errors.fetchLastCheckin'), error);
      return;
    }

    if (data?.last_checked_in_utc) {
      const lastCheckinDate = new Date(data.last_checked_in_utc);
      const today = new Date();
      const isFromToday = isSameDay(lastCheckinDate, today);

      setLastCheckinUtc(data.last_checked_in_utc);
      setCheckedInToday(isFromToday);

      if (isFromToday) {
        await cancelTodayReminderAfterCheckin();
      }

      setShowResetButton(isFromToday);

      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          checkedInToday: isFromToday,
          lastCheckinUtc: data.last_checked_in_utc,
        })
      );
    } else {
      setCheckedInToday(false);
      setShowResetButton(false);
      setLastCheckinUtc(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      console.log('📱 Home screen focused - fetching fresh data');
      fetchLastCheckin();
      fetchContactsCount();
    }, [fetchLastCheckin, fetchContactsCount])
  );


  const handleCheckIn = useCallback(async () => {
    try {
      if (!user) throw new Error(t('home.errors.noUser'));

      triggerCheckInAnimation();

      const tz = (Localization as any).timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      // Insert checkin to database
      const { data, error } = await supabase
        .from('checkins')
        .insert({
          user_id: user.id,
          checkin_timezone: tz,
        })
        .select('id, checked_in_at_utc')
        .single();

      if (error) throw error;
      if (!data) return;

      // Send notifications to contacts USING TOKENMANAGER
      await sendCheckinNotification(
        user.id,
        data.checked_in_at_utc,
        tz
      );

      // Update local state
      setCheckedInToday(true);
      setShowResetButton(true);
      setLastCheckinUtc(data.checked_in_at_utc);
      setLastCheckinId(data.id);

      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          checkedInToday: true,
          lastCheckinUtc: data.checked_in_at_utc,
          checkinTimezone: tz,
        })
      );

      await cancelTodayReminderAfterCheckin();
      refetchStreak();

    } catch (err) {
      console.error(t('home.errors.checkin'), err);
    }
  }, [user, t, triggerCheckInAnimation, refetchStreak]);

  // Lifecycle effects
  useEffect(() => {
    if (!loading && user) {
      fetchLastCheckin();
    }
  }, [loading, user, fetchLastCheckin]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login');
    }
  }, [loading, user]);

  useEffect(() => {
    const loadState = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) {
          setIsInitialLoad(false);
          return;
        }

        const parsed = JSON.parse(saved);
        const savedLastCheckinUtc = parsed.lastCheckinUtc ?? null;

        if (savedLastCheckinUtc) {
          const lastCheckinDate = new Date(savedLastCheckinUtc);
          const today = new Date();
          const isFromToday = isSameDay(lastCheckinDate, today);

          setCheckedInToday(isFromToday);
          setShowResetButton(isFromToday);
          setLastCheckinUtc(savedLastCheckinUtc);
        } else {
          setCheckedInToday(false);
          setShowResetButton(false);
          setLastCheckinUtc(null);
        }
      } catch (err) {
        console.error(t('home.errors.loadState'), err);
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadState();
  }, [t]);

  // Main timer and reset interval
  useEffect(() => {
    const updateTimeAndCheckReset = () => {
      const newNow = new Date();
      setNow(newNow);
      checkDateAndReset();
    };

    updateTimeAndCheckReset();

    const timeInterval = setInterval(() => {
      const newNow = new Date();
      setNow(newNow);
    }, 1000);

    const resetCheckInterval = setInterval(checkDateAndReset, 30000);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        console.log('📱 Home screen - app foregrounded - fetching fresh check-in status');
        updateTimeAndCheckReset();
      }
    });

    return () => {
      clearInterval(timeInterval);
      clearInterval(resetCheckInterval);
      subscription.remove();
    };
  }, [checkDateAndReset]);

  useEffect(() => {
    let isMounted = true;

    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('📱 App became active - refreshing home data');
        if (isMounted) {
          fetchLastCheckin();
          refetchStreak();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [fetchLastCheckin, refetchStreak]);

  useEffect(() => {
    const streakRefreshInterval = setInterval(() => {
      refetchStreak();
    }, 60 * 60 * 1000);

    return () => clearInterval(streakRefreshInterval);
  }, [refetchStreak]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        refetchStreak();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [refetchStreak]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const elapsedMs = now.getTime() - startOfDay.getTime();
  const progress = Math.min(elapsedMs / MS_IN_DAY, 1);
  const remainingMs = Math.max(0, MS_IN_DAY - elapsedMs);

  if (loading || isInitialLoad) {
    return (
      <SafeAreaView style={styles.mainContainer}>
        <View style={styles.loadingContainer}>
          <Animated.View
            style={[
              styles.loadingPulse,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
        </View>
      </SafeAreaView>
    );
  }

  const greetingInfo = getGreetingInfo(now, t);

  return (
    <SafeAreaView style={styles.mainContainer} edges={['top']}>
      {/* HEADER - OUTSIDE SCROLLVIEW (FIXED) */}
      <ScreenHeader
        title={profile?.display_name || t('home.welcome')}
        subtitle={greetingInfo.greeting}
        iconName={greetingInfo.iconName as any}
        showGreetingInLine={true}
        rightElement={
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={ICON_SIZES.MD} color={BaseColors.primary} />
          </TouchableOpacity>
        }
      />

      {/* SCROLLVIEW - EVERYTHING ELSE SCROLLS */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={true}
        pinchGestureEnabled={false}
        maximumZoomScale={1}
        minimumZoomScale={1}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* DATE & TIME */}
          <View style={[styles.dateTimeGroup, styles.groupContainer]}>
            <Text style={styles.timeText}>{formatTime24h(now, i18n.language)}</Text>
            <Text style={styles.dateText}>{formatDateWithTranslation(now, t, i18n.language)}</Text>
          </View>

          {/* MAIN CHECK-IN */}
          <View style={[styles.checkInGroup, styles.groupContainer]}>
            <View style={styles.checkInContainer}>
              <Animated.View
                style={{
                  transform: [{ scale: Animated.multiply(pulseAnim, scaleAnim) }],
                }}
              >
                <TouchableOpacity
                  onPress={handleCheckIn}
                  activeOpacity={0.9}
                  style={[
                    styles.checkInButton,
                    {
                      width: CIRCLE_SIZE,
                      height: CIRCLE_SIZE,
                    }
                  ]}
                >
                  {/* Outer border */}
                  <View style={[
                    styles.circleBorder,
                    {
                      width: CIRCLE_SIZE,
                      height: CIRCLE_SIZE,
                      borderRadius: CIRCLE_SIZE / 2,
                    }
                  ]} />

                  {/* SVG Container */}
                  <View style={[
                    styles.svgContainer,
                    {
                      width: CIRCLE_SIZE,
                      height: CIRCLE_SIZE,
                    }
                  ]}>
                    <Svg
                      width={CIRCLE_SIZE}
                      height={CIRCLE_SIZE}
                      style={{ transform: [{ rotate: '-90deg' }] }}
                      viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
                    >
                      {/* Background circle */}
                      <Circle
                        cx={CIRCLE_SIZE / 2}
                        cy={CIRCLE_SIZE / 2}
                        r={CIRCLE_RADIUS}
                        stroke={BaseColors.primary}
                        strokeWidth={STROKE_WIDTH + 3}
                        fill="none"
                      />

                      {/* Progress circle */}
                      {!checkedInToday ? (
                        <Circle
                          cx={CIRCLE_SIZE / 2}
                          cy={CIRCLE_SIZE / 2}
                          r={CIRCLE_RADIUS}
                          stroke={BaseColors.primaryLight}
                          strokeWidth={STROKE_WIDTH}
                          fill="none"
                          strokeDasharray={2 * Math.PI * CIRCLE_RADIUS}
                          strokeDashoffset={2 * Math.PI * CIRCLE_RADIUS * (1 - progress)}
                          opacity={0.7}
                          strokeLinecap="butt"
                        />
                      ) : (
                        <Circle
                          cx={CIRCLE_SIZE / 2}
                          cy={CIRCLE_SIZE / 2}
                          r={CIRCLE_RADIUS}
                          stroke={BaseColors.primary}
                          strokeWidth={STROKE_WIDTH}
                          fill="none"
                          strokeLinecap="round"
                        />
                      )}
                    </Svg>
                  </View>

                  {/* Inner Button */}
                  <View
                    style={[
                      styles.innerButton,
                      {
                        width: INNER_BUTTON_SIZE,
                        height: INNER_BUTTON_SIZE,
                        borderRadius: INNER_BUTTON_SIZE / 2,
                        left: INNER_BUTTON_OFFSET,
                        top: INNER_BUTTON_OFFSET,
                      },
                      checkedInToday ? styles.innerButtonChecked : styles.innerButtonUnchecked,
                    ]}
                  >
                    {/* Icon */}
                    <View style={styles.iconContainer}>
                      {checkedInToday ? (
                        <Ionicons name="heart-sharp" size={ICON_SIZES.SUPER_HUGE} color="#fff" />
                      ) : (
                        <Ionicons name="heart" size={ICON_SIZES.SUPER_HUGE} color={BaseColors.primary} />
                      )}
                    </View>

                    {/* Text Content */}
                    <View style={styles.textContainer}>
                      {checkedInToday ? (
                        <Text
                          style={styles.checkedInText}
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.6}
                        >
                          {t('home.everythingIsFine')}
                        </Text>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.ctaText,
                              fontScale > 1.2 && styles.compactCtaText
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {t('home.pressMeToCheckIn')}
                          </Text>
                          <Text
                            style={[
                              styles.countdownText,
                              fontScale > 1.2 && styles.compactCountdownText
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {formatTimeLeft(remainingMs)}
                          </Text>
                          <Text
                            style={[
                              styles.timeLeftText,
                              fontScale > 1.2 && styles.compactTimeLeftText
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {t('home.timeLeftToday')}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>

          {/* WARNING MESSAGE */}
          <View style={[styles.warningGroup, styles.groupContainer]}>
            {checkedInToday ? (
              <View style={styles.messageContainer}>
                <View style={styles.warningIconContainer}>
                  <Ionicons name="checkmark-circle" size={ICON_SIZES.SM} color={BaseColors.primary} />
                </View>
                <Text
                  style={styles.messageText}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('home.youCheckedInTodayAt', {
                    time: formatTime24h(new Date(lastCheckinUtc || ''), i18n.language)
                  })}
                </Text>
              </View>
            ) : (
              <View style={styles.warningContainer}>
                <View style={styles.warningIconContainer}>
                  <Ionicons name="alert-circle" size={ICON_SIZES.SM} color={BaseColors.error} />
                </View>
                <Text
                  style={styles.warningText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('home.dontForget')}
                </Text>
              </View>
            )}
          </View>

          {/* ACTION CARDS */}
          <View style={[styles.cardsGroup, styles.groupContainer]}>
            <View style={styles.cardsContainer}>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/activity')}
                style={styles.card}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={[styles.iconContainerBase, styles.activityIconContainer]}>
                    <Ionicons name="pulse" size={ICON_SIZES.LG} color={BaseColors.primary} />
                  </View>
                </View>
                <Text style={styles.cardLabel}>{t('home.activity')}</Text>
                <Text style={styles.cardSubtext}>
                  {t('home.contacts', { count: contactsCount })}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                // onPress={() => router.push('/(tabs)/statistics')}
                style={styles.card}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={[styles.iconContainerBase, styles.streakIconContainer]}>
                    <Ionicons name="flame" size={ICON_SIZES.LG} color={BaseColors.primary} />
                  </View>
                </View>
                <Text style={styles.cardLabel}>{t('home.streak')}</Text>
                <Text style={styles.cardSubtext}>
                  {t('home.days', { count: streak })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}


// ==================== STYLES ====================
const GROUP_GAP = 18;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: BaseColors.background,
  },
  profileButton: {
    width: 34,
    height: 34,
    borderRadius: 22,
    backgroundColor: BaseColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BaseColors.neutral[200],
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: BaseColors.primaryLight,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  groupContainer: {
    marginBottom: GROUP_GAP,
  },
  dateTimeGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  timeText: {
    fontSize: 36,
    fontWeight: '700',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },
  dateText: {
    fontSize: 16,
    color: BaseColors.neutral[500],
    marginTop: 6,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  checkInGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  checkInContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  checkedInText: {
    color: BaseColors.surface,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  circleBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: BaseColors.primaryBorder,
    left: 0,
    top: 0,
  },
  svgContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  innerButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderWidth: 3,
    margin: 0,
    padding: 0,
    paddingTop: INNER_BUTTON_SIZE * 0.15,
  },
  innerButtonUnchecked: {
    backgroundColor: BaseColors.primaryLight,
    borderColor: BaseColors.primary,
  },
  innerButtonChecked: {
    backgroundColor: BaseColors.primary,
    borderColor: BaseColors.primary,
  },
  iconContainer: {
    marginBottom: 4,
    marginTop: 4,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 4,
    maxWidth: '100%',
    width: '100%',
    marginTop: -4,
  },
  ctaText: {
    color: BaseColors.text.dark,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  countdownText: {
    color: BaseColors.primary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  timeLeftText: {
    color: BaseColors.text.light,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  compactCtaText: {
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  compactCountdownText: {
    fontSize: 16,
    marginTop: 2,
  },
  compactTimeLeftText: {
    fontSize: 9,
    marginTop: 0,
  },
  cardsGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginBottom: 24,
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  card: {
    flex: 1,
    backgroundColor: BaseColors.surface,
    borderRadius: 20,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BaseColors.neutral[200],
    minHeight: 100,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    color: BaseColors.text.dark,
  },
  cardSubtext: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 6,
    color: BaseColors.primary,
    textAlign: 'center',
  },
  iconContainerBase: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconContainer: {
    backgroundColor: '#EDF7F4',
  },
  streakIconContainer: {
    backgroundColor: '#FFF7ED',
  },
  bottomPadding: {
    height: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    width: '100%',
    minHeight: 44,
  },
  warningGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.errorLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BaseColors.errorBorder,
    width: '100%',
    minHeight: 44,
  },
  warningIconContainer: {
    marginRight: 8,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    color: BaseColors.primary,
    lineHeight: 18,
  },
  warningText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
    color: BaseColors.error,
    lineHeight: 18,
  }
});