// app/(tabs)/index.tsx 
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { useStreak } from '@/hooks/useStreak';
import {
  cancelTodayReminderAfterCheckin,
  scheduleDailyReminder
} from '@/lib/notifications/reminderManager';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  AppState,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CIRCLE_SIZE = Math.min(SCREEN_WIDTH * 0.7, 250);
const STROKE_WIDTH = 40; // Change this to whatever you want (was 16)
const MAX_STROKE = STROKE_WIDTH + 3; // The outer "fake" stroke that creates the border effect
const CIRCLE_RADIUS = (CIRCLE_SIZE - MAX_STROKE) / 2;
const INNER_BUTTON_SIZE = CIRCLE_SIZE - STROKE_WIDTH; // New calculation
const INNER_BUTTON_OFFSET = STROKE_WIDTH / 2; // New calculation

const STORAGE_KEY = '@checkin_state';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const IS_IOS = Platform.OS === 'ios';

// Helper function to get both greeting and icon name
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

// Date comparison helper
const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

// Helper function to convert numbers to Chinese numerals
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
    return num.toString(); // fallback
  }
};

// Updated date formatting function
const formatDateWithTranslation = (date: Date, t: any, language?: string) => {
  const weekdayIndex = date.getDay();
  const monthIndex = date.getMonth();
  const day = date.getDate();

  // Default to English if no language provided
  const lang = language || 'en';

  try {
    // Try to get translations
    const weekdayKey = `home.dateFormats.weekdays.${weekdayIndex}`;
    const monthKey = `home.dateFormats.months.${monthIndex}`;

    const weekday = t(weekdayKey, { lng: lang });
    const month = t(monthKey, { lng: lang });

    // Check if we got valid translations
    const gotWeekday = weekday && typeof weekday === 'string' && !weekday.includes('home.dateFormats');
    const gotMonth = month && typeof month === 'string' && !month.includes('home.dateFormats');

    if (gotWeekday && gotMonth) {
      // We have valid translations
      const isChinese = lang.startsWith('zh') || lang.includes('Chinese');

      if (isChinese) {
        // Chinese format: "星期一, 二月五号" (with Chinese numeral)
        const chineseDay = numberToChinese(day);
        // Make sure month doesn't already have "月"
        const cleanMonth = month.replace('月', '');
        return `${weekday}, ${cleanMonth}月${chineseDay}号`;
      } else {
        // Western format: "Monday, 5 February"
        return `${weekday}, ${day} ${month}`;
      }
    }
  } catch (error) {
    console.log('Translation attempt failed:', error);
  }

  // Fallback to English
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
    // Chinese format with English month names (fallback)
    const chineseDay = numberToChinese(day);
    return `${weekday}, ${month}月${chineseDay}号`;
  } else {
    // English format
    return `${weekday}, ${day} ${month}`;
  }
};

// Time formatting with locale
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

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

  const [contactsCount, setContactsCount] = useState(0);

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


  useFocusEffect(
    useCallback(() => {
      fetchLastCheckin();
      fetchContactsCount();   // add this
    }, [fetchLastCheckin, fetchContactsCount])
  );


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

    // If last check-in was NOT today, reset AND refresh streak
    if (!isSameDay(lastCheckinDate, today)) {
      resetAllState();
      // Refresh streak since date changed
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

      // Check if the check-in was today
      const isFromToday = isSameDay(lastCheckinDate, today);

      setLastCheckinUtc(data.last_checked_in_utc);
      setCheckedInToday(isFromToday);

      // ⭐ Sync reminder state
      if (isFromToday) {
        await cancelTodayReminderAfterCheckin();
      } else {
        await scheduleDailyReminder();
      }



      setShowResetButton(isFromToday);

      // Save to AsyncStorage with correct "today" status
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          checkedInToday: isFromToday,
          lastCheckinUtc: data.last_checked_in_utc,
        })
      );
    } else {
      // No check-in found
      setCheckedInToday(false);
      setShowResetButton(false);
      setLastCheckinUtc(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log('📱 Home screen focused - fetching fresh check-in status');
        fetchLastCheckin();
      }
    }, [user, fetchLastCheckin])
  );

  const handleCheckIn = useCallback(async () => {
    try {
      if (!user) throw new Error(t('home.errors.noUser'));

      triggerCheckInAnimation();

      const tz = (Localization as any).timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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

      // Update state - this check-in is definitely from today
      setCheckedInToday(true);
      setShowResetButton(true);
      setLastCheckinUtc(data.checked_in_at_utc);
      setLastCheckinId(data.id);

      // Save to AsyncStorage
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          checkedInToday: true,
          lastCheckinUtc: data.checked_in_at_utc,
          checkinTimezone: tz,
        })
      );

      // ⭐ cancel reminder because user checked in
      await cancelTodayReminderAfterCheckin();

      // Refresh streak after successful check-in
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

        // If we have a saved check-in, check if it's from today
        if (savedLastCheckinUtc) {
          const lastCheckinDate = new Date(savedLastCheckinUtc);
          const today = new Date();

          // Only set as checked in if it was today
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
      checkDateAndReset(); // Check if we need to reset based on date
    };

    // Initial check
    updateTimeAndCheckReset();

    // Update time every second for the timer display
    const timeInterval = setInterval(() => {
      const newNow = new Date();
      setNow(newNow);
    }, 1000);

    // Check for reset every 30 seconds
    const resetCheckInterval = setInterval(checkDateAndReset, 30000);

    // ✅ FIXED: Add fetchLastCheckin() when app becomes active
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

  // ========== CONTACT REQUESTS BADGE LOGIC ==========
  // Add this useEffect alongside your existing ones
  useEffect(() => {
    let isMounted = true;

    const handleAppStateChange = (nextAppState: string) => {
      // When app comes to foreground AND this screen is likely visible
      if (nextAppState === 'active') {
        console.log('📱 App became active - refreshing home data');
        if (isMounted) {
          fetchLastCheckin(); // Refresh check-in status
          refetchStreak();    // Refresh streak
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [fetchLastCheckin, refetchStreak]); // Add dependencies



  // Refresh streak periodically (every hour) to catch date changes
  useEffect(() => {
    const streakRefreshInterval = setInterval(() => {
      refetchStreak();
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(streakRefreshInterval);
  }, [refetchStreak]);

  // Refresh streak when app becomes active
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

  // Calculations
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

  // RETURN STATEMENT AND JSX REMAINS THE SAME AS YOUR ORIGINAL CODE
  // ... (your existing return JSX code goes here)

  return (
    <SafeAreaView style={styles.mainContainer}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        {/* ========== GROUP 1: HEADER ========== */}
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

        {/* ========== GROUP 2: DATE & TIME ========== */}
        <View style={[styles.dateTimeGroup, styles.groupContainer]}>
          <Text style={styles.timeText}>{formatTime24h(now, i18n.language)}</Text>
          <Text style={styles.dateText}>{formatDateWithTranslation(now, t, i18n.language)}</Text>
        </View>

        {/* ========== GROUP 3: MAIN CHECK-IN ========== */}
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
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }
                ]}
              >
                {/* Outer border - perfectly centered */}
                <View
                  style={{
                    position: 'absolute',
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                    borderRadius: CIRCLE_SIZE / 2,
                    borderWidth: 2,
                    borderColor: BaseColors.primaryBorder,
                    // Ensure perfect centering
                    left: 0,
                    top: 0,
                  }}
                />

                {/* SVG Container - perfectly centered */}
                <View style={{
                  position: 'absolute',
                  width: CIRCLE_SIZE,
                  height: CIRCLE_SIZE,
                  left: 0,
                  top: 0,
                }}>
                  <Svg
                    width={CIRCLE_SIZE}
                    height={CIRCLE_SIZE}
                    style={{ transform: [{ rotate: '-90deg' }] }}
                    viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`} // Add viewBox for consistency
                  >
                    {/* Background circle - DARK GREEN (remaining / unprocessed) */}
                    <Circle
                      cx={CIRCLE_SIZE / 2}
                      cy={CIRCLE_SIZE / 2}
                      r={CIRCLE_RADIUS}
                      stroke={BaseColors.primary}
                      strokeWidth={STROKE_WIDTH + 3}
                      fill="none"

                    />

                    {/* Progress circle - DARK GREEN (left to be processed) */}
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
                      // Use exact calculations to ensure perfect centering
                      width: INNER_BUTTON_SIZE,
                      height: INNER_BUTTON_SIZE,
                      borderRadius: INNER_BUTTON_SIZE / 2,
                      position: 'absolute',
                      left: INNER_BUTTON_OFFSET,
                      top: INNER_BUTTON_OFFSET,
                      // Remove any margin/padding that could affect positioning
                      margin: 0,
                      padding: 0,
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
                      <>
                        {/* Removed the scale animation on the "Checked in" text to avoid it looking too jumpy. The heart icon animation is enough to draw attention to the new state. */}
                        {/* <Animated.View
                          style={[
                            styles.checkedInTextContainer,
                            { transform: [{ scale: successScaleAnim }] },
                          ]}
                        >
                          <Text style={styles.checkedInText}>{t('home.checkedInToday')}</Text>
                        </Animated.View> */}
                        <Text style={styles.checkedInText}>{t('home.everythingIsFine')}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.ctaText}>{t('home.pressMeToCheckIn')}</Text>
                        <Text style={styles.countdownText}>{formatTimeLeft(remainingMs)}</Text>
                        <Text style={styles.timeLeftText}>{t('home.timeLeftToday')}</Text>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ========== GROUP 4: WARNING MESSAGE ========== */}
        {checkedInToday ? (
          <View style={[styles.warningGroup, styles.groupContainer]}>
            <View style={styles.messageContainer}>
              <View style={styles.messageIconContainer}>
                <Ionicons name="alert-circle" size={ICON_SIZES.SM} color={BaseColors.primary} />
              </View>
              <Text style={styles.messageText}>{t('home.youCheckedInTodayAt', { time: formatTime24h(new Date(lastCheckinUtc), i18n.language) })}</Text>
            </View>
          </View>
        ) : (<View style={[styles.warningGroup, styles.groupContainer]}>
          <View style={styles.warningContainer}>
            <View style={styles.warningIconContainer}>
              <Ionicons name="alert-circle" size={ICON_SIZES.SM} color={BaseColors.error} />
            </View>
            <Text style={styles.warningText}>{t('home.dontForget')}</Text>
          </View>
        </View>)
        }

        {/* ========== GROUP 5: ACTION CARDS ========== */}
        <View style={[styles.cardsGroup, styles.groupContainer]}>
          <View style={styles.cardsContainer}>
            {/* TODO:  Left this code for debuging purposes, but the reset button is now hidden behind a dev flag and only shows when you check in, to avoid confusion for regular users. You can uncomment this block to see the reset button in action. */}
            {/* {showResetButton ? (
              <TouchableOpacity
                onPress={resetAllState}
                style={[styles.card, styles.resetCard]}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={styles.resetIconContainer}>
                    <Ionicons name="refresh" size={ICON_SIZES.MD} color={BaseColors.error} />
                  </View>
                </View>
                <Text style={styles.resetText}>{t('home.reset')}</Text>
                <Text style={styles.cardSubtext}>{t('home.timer')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/activity')}
                style={styles.card}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={[styles.iconContainerBase, styles.activityIconContainer]}>
                    <Ionicons name="pulse" size={24} color={BaseColors.primary} />
                  </View>
                </View>
                <Text style={styles.cardLabel}>{t('home.activity')}</Text>
                <Text style={styles.cardSubtext}>{contactsCount + " " + t('home.contacts')}</Text>
              </TouchableOpacity>
            )} */}

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
              <Text style={styles.cardSubtext}>{t('home.contacts', { count: contactsCount })}</Text>
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
              <Text style={styles.cardSubtext}>{t('home.days', { count: streak })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const GROUP_GAP = 24;

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
  groupContainer: {
    marginBottom: GROUP_GAP,
  },
  headerGroup: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 16,
    color: BaseColors.neutral[500],
    fontWeight: '500',
    textTransform: 'capitalize',
    marginLeft: 8,
  },
  displayName: {
    fontSize: 32,
    fontWeight: '800',
    color: BaseColors.text.dark,
  },
  dateTimeGroup: {
    alignItems: 'center',
    justifyContent: 'center',
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
  svg: {
    position: 'absolute',
  },
  innerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
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
    marginBottom: 12,
  },
  textContainer: {
    alignItems: 'center',
  },
  checkedInTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedInText: {
    color: BaseColors.surface,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkInTime: {
    color: BaseColors.surface,
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  ctaText: {
    color: BaseColors.text.dark,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
  },
  countdownText: {
    color: BaseColors.primary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  timeLeftText: {
    color: BaseColors.text.light,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  warningGroup: {},
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    alignSelf: 'center',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BaseColors.errorLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BaseColors.errorBorder,
    alignSelf: 'center',
  },
  messageIconContainer: {
    marginRight: 10,
  },
  warningIconContainer: {
    marginRight: 10,
  },
  messageText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
    color: BaseColors.primary,
  },
  warningText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
    color: BaseColors.error,
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
  resetCard: {
    backgroundColor: BaseColors.errorLight,
    borderColor: BaseColors.errorBorder,
  },
  cardIcon: {
    marginBottom: 12,
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
    marginTop: 10,
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
  resetIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: BaseColors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BaseColors.errorBorder,
  }
});