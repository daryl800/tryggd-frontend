// app/(tabs)/index.tsx 
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { UI_FEATURE_FLAGS } from '@/constants/featureFlags';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { useStreak } from '@/hooks/useStreak';
import { getOptionalCheckinLocation } from '@/lib/location/checkinLocation';
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
  GestureResponderEvent,
  LayoutChangeEvent,
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
import { iosFontSize } from '@/constants/typography';

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
const WELLNESS_MIN = -2;
const WELLNESS_MAX = 2;
const WELLNESS_DEFAULT = 0;
const WELLNESS_STEPS = WELLNESS_MAX - WELLNESS_MIN + 1;
const SCROLL_OVERFLOW_TOLERANCE = Platform.OS === 'android' ? 40 : 8;

const clampWellnessValue = (value: number) =>
  Math.max(WELLNESS_MIN, Math.min(WELLNESS_MAX, value));

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

const getChineseFontFamily = (language?: string) => {
  if (Platform.OS !== 'ios') return undefined;
  if (language === 'zh-Hans') return 'PingFang SC';
  if (language === 'zh-Hant') return 'PingFang TC';
  return undefined;
};

type WellnessSliderProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  onLockedPress?: () => void;
};

const getWellnessValueFromPosition = (positionX: number, width: number) => {
  if (width <= 0) return WELLNESS_DEFAULT;

  const clampedX = Math.min(width, Math.max(0, positionX));
  const ratio = clampedX / width;
  const stepIndex = Math.round(ratio * (WELLNESS_STEPS - 1));
  return clampWellnessValue(WELLNESS_MIN + stepIndex);
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const parsed = Number.parseInt(value, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;

const interpolateColor = (from: string, to: string, ratio: number) => {
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex({
    r: start.r + (end.r - start.r) * ratio,
    g: start.g + (end.g - start.g) * ratio,
    b: start.b + (end.b - start.b) * ratio,
  });
};

const getWellnessHeartColor = (score: number) => {
  const clampedScore = clampWellnessValue(score);
  const lowColor = '#7A7A7A';
  const midColor = BaseColors.primary;
  const highColor = '#FFD700';

  if (clampedScore <= 0) {
    const ratio = (clampedScore - WELLNESS_MIN) / (WELLNESS_DEFAULT - WELLNESS_MIN || 1);
    return interpolateColor(lowColor, midColor, ratio);
  }

  const ratio = clampedScore / WELLNESS_MAX;
  return interpolateColor(midColor, highColor, ratio);
};

const getWellnessMessageKey = (score: number) => {
  const clampedScore = clampWellnessValue(score);
  if (clampedScore <= -2) return 'activity.wellness.veryLow';
  if (clampedScore === -1) return 'activity.wellness.low';
  if (clampedScore === 0) return 'activity.wellness.neutral';
  if (clampedScore === 1) return 'activity.wellness.good';
  return 'activity.wellness.great';
};

const getWellnessHandleEmoji = (score: number) => {
  const clampedScore = clampWellnessValue(score);
  if (clampedScore <= -2) return '😔';
  if (clampedScore === -1) return '😕';
  if (clampedScore === 0) return '🙂';
  if (clampedScore === 1) return '☺️';
  return '😊';
};

const getLocalDayBounds = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
};

const WellnessSlider = ({ value, onChange, disabled = false, onLockedPress }: WellnessSliderProps) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const lastValueRef = useRef(value);

  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  const updateValueFromEvent = useCallback(
    (event: GestureResponderEvent) => {
      const nextValue = getWellnessValueFromPosition(event.nativeEvent.locationX, trackWidth);

      if (nextValue === lastValueRef.current) return;

      lastValueRef.current = nextValue;
      onChange(nextValue);
      void Haptics.selectionAsync();
    },
    [onChange, trackWidth]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const normalizedValue = (value - WELLNESS_MIN) / (WELLNESS_STEPS - 1);
  const handleLeft = trackWidth > 0 ? normalizedValue * trackWidth : 0;
  const handleEmoji = getWellnessHandleEmoji(value);
  const edgeLowColor = disabled ? BaseColors.neutral[300] : BaseColors.neutral[400];
  const edgeHighColor = disabled ? BaseColors.neutral[300] : BaseColors.primary;

  return (
    <TouchableOpacity
      activeOpacity={disabled ? 0.85 : 1}
      disabled={!disabled}
      onPress={onLockedPress}
      style={[
        styles.wellnessCard,
        disabled && styles.wellnessCardDisabled,
      ]}
    >
      <View style={styles.wellnessSliderRow}>
        <TouchableOpacity
          onPress={disabled ? onLockedPress : () => onChange(WELLNESS_MIN)}
          activeOpacity={0.7}
          style={styles.wellnessEdgeButton}
        >
          <Ionicons
            name="sad-outline"
            size={24}
            color={edgeLowColor}
            style={styles.wellnessEdgeIcon}
          />
        </TouchableOpacity>
        <View
          style={styles.wellnessTrackTouchArea}
          onLayout={handleLayout}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={disabled ? undefined : updateValueFromEvent}
          onResponderMove={disabled ? undefined : updateValueFromEvent}
        >
          <View style={[styles.wellnessTrack, disabled && styles.wellnessTrackDisabled]} />
          <View style={styles.wellnessMarkersRow} pointerEvents="none">
            {Array.from({ length: WELLNESS_STEPS }).map((_, index) => (
              <View
                key={`wellness-marker-${index}`}
                style={[
                  styles.wellnessMarker,
                  disabled && styles.wellnessMarkerDisabled,
                  index === WELLNESS_DEFAULT - WELLNESS_MIN && styles.wellnessCenterMarker,
                  disabled && index === WELLNESS_DEFAULT - WELLNESS_MIN && styles.wellnessCenterMarkerDisabled,
                ]}
              />
            ))}
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.wellnessThumb,
              disabled && styles.wellnessThumbDisabled,
              trackWidth > 0 && { left: handleLeft - 16 },
            ]}
          >
            <Text style={styles.wellnessThumbEmoji}>{handleEmoji}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={disabled ? onLockedPress : () => onChange(WELLNESS_MAX)}
          activeOpacity={0.7}
          style={styles.wellnessEdgeButton}
        >
          <Ionicons
            name="happy-outline"
            size={24}
            color={edgeHighColor}
            style={styles.wellnessEdgeIcon}
          />
        </TouchableOpacity>
      </View>
      {disabled ? (
        <View style={styles.wellnessThumbLockBadge} pointerEvents="none">
          <Ionicons name="lock-closed" size={10} color={BaseColors.primaryDark} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, profile, loading, capabilities } = useAuth();

  // State
  const [now, setNow] = useState(new Date());
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [lastCheckinUtc, setLastCheckinUtc] = useState<string | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const { streak, loading: streakLoading, refetch: refetchStreak } = useStreak();
  const [showResetButton, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [fontScale, setFontScale] = useState(1);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [contactsCount, setContactsCount] = useState(0);
  const [wellnessScore, setWellnessScore] = useState(WELLNESS_DEFAULT);
  const [submittedWellnessScore, setSubmittedWellnessScore] = useState(WELLNESS_DEFAULT);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

  // Font scale on mount
  useEffect(() => {
    setFontScale(PixelRatio.getFontScale());
  }, []);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auth redirect
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login');
    }
  }, [loading, user]);

  // Load saved state from AsyncStorage
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
          if (!isFromToday) {
            setWellnessScore(WELLNESS_DEFAULT);
            setSubmittedWellnessScore(WELLNESS_DEFAULT);
          }
        } else {
          setCheckedInToday(false);
          setShowResetButton(false);
          setLastCheckinUtc(null);
          setWellnessScore(WELLNESS_DEFAULT);
          setSubmittedWellnessScore(WELLNESS_DEFAULT);
        }
      } catch (err) {
        console.error(t('home.errors.loadState'), err);
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadState();
  }, [t]);

  // Fetch contacts count
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

  // Reset all state
  const resetAllState = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCheckedInToday(false);
    setLastCheckinUtc(null);
    setLastCheckinId(null);
    setShowResetButton(false);
    setWellnessScore(WELLNESS_DEFAULT);
    setSubmittedWellnessScore(WELLNESS_DEFAULT);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  // Check if date has changed and reset if needed
  const checkDateAndReset = useCallback(() => {
    if (!lastCheckinUtc) return;

    const lastCheckinDate = new Date(lastCheckinUtc);
    const today = new Date();

    if (!isSameDay(lastCheckinDate, today)) {
      resetAllState();
      refetchStreak();
    }
  }, [lastCheckinUtc, resetAllState, refetchStreak]);

  // Fetch last checkin from Supabase
  const fetchLastCheckin = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('users_latest_checkin')
      .select('last_checked_in_utc, wellness_score')
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
      setWellnessScore(isFromToday ? data.wellness_score ?? WELLNESS_DEFAULT : WELLNESS_DEFAULT);
      setSubmittedWellnessScore(isFromToday ? data.wellness_score ?? WELLNESS_DEFAULT : WELLNESS_DEFAULT);

      if (isFromToday) {
        const { startIso, endIso } = getLocalDayBounds(today);
        const { data: todayCheckin } = await supabase
          .from('checkins')
          .select('id, wellness_score')
          .eq('user_id', user.id)
          .gte('checked_in_at_utc', startIso)
          .lt('checked_in_at_utc', endIso)
          .order('checked_in_at_utc', { ascending: false })
          .limit(1)
          .maybeSingle();

        setLastCheckinId(todayCheckin?.id ?? null);
        if (todayCheckin?.wellness_score != null) {
          setWellnessScore(todayCheckin.wellness_score);
          setSubmittedWellnessScore(todayCheckin.wellness_score);
        }
      } else {
        setLastCheckinId(null);
      }

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
        setLastCheckinId(null);
        setWellnessScore(WELLNESS_DEFAULT);
        setSubmittedWellnessScore(WELLNESS_DEFAULT);
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
  }, [user, t]);

  // Fetch initial data when user loads
  useEffect(() => {
    if (!loading && user) {
      fetchLastCheckin();
      fetchContactsCount();
    }
  }, [loading, user, fetchLastCheckin, fetchContactsCount]);

  // Timer and AppState handler (CONSOLIDATED)
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        console.log('📱 App became active - refreshing data');
        // Update time
        setNow(new Date());
        // Check date reset
        checkDateAndReset();
        // Fetch fresh data
        fetchLastCheckin();
        refetchStreak();
        fetchContactsCount();
      }
    };

    const timeInterval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    const resetCheckInterval = setInterval(checkDateAndReset, 30000);

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      clearInterval(timeInterval);
      clearInterval(resetCheckInterval);
      subscription.remove();
    };
  }, [checkDateAndReset, fetchLastCheckin, refetchStreak, fetchContactsCount]);

  // Hourly streak refresh
  useEffect(() => {
    const streakRefreshInterval = setInterval(() => {
      refetchStreak();
    }, 60 * 60 * 1000);

    return () => clearInterval(streakRefreshInterval);
  }, [refetchStreak]);

  // Heartbeat animation
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

  // Success animation
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

  // Notification response handler
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { type, isBackup } = response.notification.request.content.data;

      if (type === 'self_reminder_backup' && isBackup) {
        console.log('Backup notification tapped');
        fetchLastCheckin();
      }
    });

    return () => subscription.remove();
  }, [fetchLastCheckin]);

  // Focus effect for tab navigation
  useFocusEffect(
    useCallback(() => {
      console.log('📱 Home screen focused - fetching fresh data');
      fetchLastCheckin();
      fetchContactsCount();
    }, [fetchLastCheckin, fetchContactsCount])
  );

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

  const handleWellnessUpgradePress = useCallback(() => {
    router.push('/(tabs)/plus');
  }, [router]);

  // const handleCheckIn = useCallback(async () => {
  //   if (isCheckingIn) return;

  //   try {
  //     if (!user) throw new Error(t('home.errors.noUser'));

  //     setIsCheckingIn(true);
  //     triggerCheckInAnimation();

  //     const timeZone = Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  //     // Insert checkin to database
  //     const { data, error } = await supabase
  //       .from('checkins')
  //       .insert({
  //         user_id: user.id,
  //         checkin_timezone: timeZone,
  //       })
  //       .select('id, checked_in_at_utc')
  //       .single();

  //     if (error) throw error;
  //     if (!data) return;

  //     // Send notifications to contacts
  //     try {
  //       await sendCheckinNotification(
  //         user.id,
  //         data.checked_in_at_utc,
  //         timeZone
  //       );
  //     } catch (notificationError) {
  //       console.error('Failed to send notifications:', notificationError);
  //       // Don't throw - continue with check-in even if notifications fail
  //     }

  //     // Update local state
  //     setCheckedInToday(true);
  //     setShowResetButton(true);
  //     setLastCheckinUtc(data.checked_in_at_utc);
  //     setLastCheckinId(data.id);

  //     await AsyncStorage.setItem(
  //       STORAGE_KEY,
  //       JSON.stringify({
  //         checkedInToday: true,
  //         lastCheckinUtc: data.checked_in_at_utc,
  //         checkinTimezone: timeZone,
  //       })
  //     );

  //     await cancelTodayReminderAfterCheckin();
  //     refetchStreak();

  //   } catch (err) {
  //     console.error(t('home.errors.checkin'), err);
  //   } finally {
  //     setIsCheckingIn(false);
  //   }
  // }, [user, t, triggerCheckInAnimation, refetchStreak, isCheckingIn]);

  const handleCheckIn = useCallback(async () => {
    if (isCheckingIn) return;

    try {
      if (!user) throw new Error(t('home.errors.noUser'));

      setIsCheckingIn(true);

      // 🚀 OPTIMISTIC UI UPDATE - happens immediately!
      setCheckedInToday(true);
      setShowResetButton(true);

      // Trigger animation
      triggerCheckInAnimation();

      const timeZone = Localization.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      // Do the actual API calls in the background
      Promise.all([
        // Insert checkin to database
        getOptionalCheckinLocation(user.id, capabilities.canShareLocation)
          .then(async (locationPayload) => {
            console.log('📍 Check-in location payload:', locationPayload);

            const nowDate = new Date();
            const { startIso, endIso } = getLocalDayBounds(nowDate);
            const fallbackLegacyWrite = async () => {
              const shouldUpdateToday = !!lastCheckinUtc && isSameDay(new Date(lastCheckinUtc), nowDate);

              if (shouldUpdateToday) {
                const existingId = lastCheckinId ?? (
                  await supabase
                    .from('checkins')
                    .select('id')
                    .eq('user_id', user.id)
                    .gte('checked_in_at_utc', startIso)
                    .lt('checked_in_at_utc', endIso)
                    .order('checked_in_at_utc', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                ).data?.id;

                if (existingId) {
                  return supabase
                    .from('checkins')
                    .update({
                      checked_in_at_utc: new Date().toISOString(),
                      checkin_timezone: timeZone,
                      ...(locationPayload || {}),
                    })
                    .eq('id', existingId)
                    .select('id, checked_in_at_utc')
                    .single();
                }
              }

              return supabase
                .from('checkins')
                .insert({
                  user_id: user.id,
                  checkin_timezone: timeZone,
                  ...(locationPayload || {}),
                })
                .select('id, checked_in_at_utc')
                .single();
            };

            const rpcResult = await supabase.rpc('upsert_daily_checkin', {
              p_checkin_timezone: timeZone,
              p_local_day_start_utc: startIso,
              p_local_day_end_utc: endIso,
              p_wellness_score: capabilities.canUseWellnessSlider ? wellnessScore : null,
              p_location_latitude: locationPayload?.location_latitude ?? null,
              p_location_longitude: locationPayload?.location_longitude ?? null,
              p_location_accuracy_meters: locationPayload?.location_accuracy_meters ?? null,
            });

            if (!rpcResult.error) {
              return rpcResult;
            }

            const rpcMissing =
              rpcResult.error.code === 'PGRST202' ||
              rpcResult.error.message?.includes('upsert_daily_checkin');

            const rpcSchemaMismatch =
              rpcResult.error.code === '42703' ||
              rpcResult.error.message?.includes('users_latest_checkin') ||
              rpcResult.error.message?.includes('priority');

            if (rpcMissing || rpcSchemaMismatch) {
              console.warn('upsert_daily_checkin unavailable or incompatible, falling back to legacy check-in write', rpcResult.error);
              return fallbackLegacyWrite();
            }

            return rpcResult;
          })
          .then(async ({ data, error }) => {
            if (error) throw error;
            const checkinRow = Array.isArray(data) ? data[0] : data;
            if (!checkinRow) return;

            // Update with real data
            setLastCheckinUtc(checkinRow.checked_in_at_utc);
            setLastCheckinId(checkinRow.id);
            setSubmittedWellnessScore(capabilities.canUseWellnessSlider ? wellnessScore : WELLNESS_DEFAULT);

            await AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                checkedInToday: true,
                lastCheckinUtc: checkinRow.checked_in_at_utc,
                checkinTimezone: timeZone,
              })
            );

            await cancelTodayReminderAfterCheckin();
            refetchStreak();
          })
      ]).catch(err => {
        // If something fails, revert the optimistic update
        console.error(t('home.errors.checkin'), err);
        setCheckedInToday(false);
        setShowResetButton(false);
      });

    } finally {
      setIsCheckingIn(false);
    }
  }, [capabilities.canShareLocation, capabilities.canUseWellnessSlider, user, t, triggerCheckInAnimation, refetchStreak, wellnessScore]);


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
  const showLockedPlusWellness = UI_FEATURE_FLAGS.showPlusUpsellUI && !capabilities.isPlus;
  const showWellnessModule = capabilities.isPlus || showLockedPlusWellness;
  const displayWellnessScore = capabilities.canUseWellnessSlider ? wellnessScore : WELLNESS_DEFAULT;
  const heartColor = capabilities.canUseWellnessSlider ? getWellnessHeartColor(displayWellnessScore) : BaseColors.primary;
  const checkedInMessage = capabilities.canUseWellnessSlider
    ? t(getWellnessMessageKey(displayWellnessScore))
    : t('home.everythingIsFine');
  const chineseFontFamily = getChineseFontFamily(i18n.language);
  const checkedMessageColor =
    checkedInToday && capabilities.canUseWellnessSlider ? BaseColors.surface : BaseColors.surface;
  const shouldScroll = contentHeight > viewportHeight + SCROLL_OVERFLOW_TOLERANCE;

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
        contentContainerStyle={[
          styles.scrollContent,
          !shouldScroll && styles.scrollContentStatic,
        ]}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        bounces={false}
        showsVerticalScrollIndicator={false}
        scrollEnabled={shouldScroll}
        pinchGestureEnabled={false}
        maximumZoomScale={1}
        minimumZoomScale={1}
        overScrollMode="never"
      >
        {/* BEGIN - BELOW CODE IS FOR DEBUGGING PURPOSES - enable when needed */}
        {/* <TouchableOpacity
          onPress={async () => {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setCheckedInToday(false);
            setShowResetButton(false);
            setLastCheckinUtc(null);
            console.log('🧹 Cleared local storage');
          }}
        >
          <View style={styles.warningContainer}>
            <View style={styles.warningIconContainer}>
              <Ionicons name="refresh" size={ICON_SIZES.SM} color={BaseColors.error} />
            </View>
            <Text
              style={styles.warningText}
            >
              Clear Storage (DEBUG  ONLY)
            </Text>
          </View>
        </TouchableOpacity> */}
        {/* END - ABOVE CODE IS FOR DEBUGGING PURPOSES */}

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
                  disabled={isCheckingIn}
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
                        <View style={styles.checkedHeartStack}>
                          {capabilities.canUseWellnessSlider && (
                            <Ionicons
                              name="heart-sharp"
                              size={ICON_SIZES.SUPER_HUGE + 10}
                              color="#fff"
                              style={styles.checkedHeartOutline}
                            />
                          )}
                          <Ionicons
                            name="heart-sharp"
                            size={ICON_SIZES.SUPER_HUGE}
                            color={capabilities.canUseWellnessSlider ? heartColor : '#fff'}
                          />
                        </View>
                      ) : (
                        <Ionicons name="heart" size={ICON_SIZES.SUPER_HUGE} color={heartColor} />
                      )}
                    </View>

                    {/* Text Content */}
                    <View style={styles.textContainer}>
                      {checkedInToday ? (
                        <Text
                          style={[
                            styles.checkedInText,
                            { color: checkedMessageColor },
                            chineseFontFamily ? { fontFamily: chineseFontFamily } : null,
                          ]}
                          ellipsizeMode="clip"
                        >
                          {checkedInMessage}
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

          {showWellnessModule ? (
            <View style={[styles.wellnessGroup, styles.groupContainer]}>
              <WellnessSlider
                value={capabilities.isPlus ? wellnessScore : WELLNESS_DEFAULT}
                onChange={setWellnessScore}
                disabled={!capabilities.isPlus}
                onLockedPress={handleWellnessUpgradePress}
              />
            </View>
          ) : null}

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

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const GROUP_GAP = 14;

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
  scrollContentStatic: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  groupContainer: {
    marginBottom: GROUP_GAP,
  },
  dateTimeGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingTop: Platform.OS === 'ios' ? 10 : 2,
  },
  timeText: {
    fontSize: iosFontSize(36),
    lineHeight: iosFontSize(40),
    fontWeight: '700',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },
  dateText: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(18),
    color: BaseColors.neutral[500],
    marginTop: 2,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  checkInGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: 8,
  },
  wellnessGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  checkInContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wellnessCard: {
    backgroundColor: BaseColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  wellnessCardDisabled: {
    borderColor: BaseColors.neutral[200],
    backgroundColor: BaseColors.neutral[50],
  },
  wellnessSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  wellnessEdgeIcon: {
    width: 24,
    textAlign: 'center',
  },
  wellnessEdgeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  wellnessTrackTouchArea: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  wellnessTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: BaseColors.primaryBorder,
  },
  wellnessTrackDisabled: {
    backgroundColor: BaseColors.neutral[200],
  },
  wellnessMarkersRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  wellnessMarker: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BaseColors.neutral[300],
  },
  wellnessMarkerDisabled: {
    backgroundColor: BaseColors.neutral[200],
  },
  wellnessCenterMarker: {
    backgroundColor: BaseColors.primary,
  },
  wellnessCenterMarkerDisabled: {
    backgroundColor: BaseColors.neutral[400],
  },
  wellnessThumb: {
    position: 'absolute',
    top: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BaseColors.surface,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  wellnessThumbDisabled: {
    borderColor: BaseColors.neutral[200],
    backgroundColor: BaseColors.surface,
  },
  wellnessThumbEmoji: {
    fontSize: 18,
    lineHeight: 20,
    textAlign: 'center',
  },
  wellnessThumbLockBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BaseColors.primaryLight,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
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
    fontSize: iosFontSize(22),
    lineHeight: iosFontSize(26),
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    flexWrap: 'wrap',
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
    marginBottom: Platform.OS === 'ios' ? 8 : 4,
    marginTop: 4,
    minHeight: ICON_SIZES.SUPER_HUGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedHeartStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedHeartOutline: {
    position: 'absolute',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 14,
    maxWidth: '100%',
    width: '100%',
    marginTop: Platform.OS === 'ios' ? 0 : -4,
  },
  ctaText: {
    color: BaseColors.text.dark,
    fontSize: iosFontSize(14),
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  countdownText: {
    color: BaseColors.primary,
    fontSize: iosFontSize(24),
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  timeLeftText: {
    color: BaseColors.text.light,
    fontSize: iosFontSize(14),
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  compactCtaText: {
    fontSize: iosFontSize(12),
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  compactCountdownText: {
    fontSize: iosFontSize(16),
    marginTop: 2,
  },
  compactTimeLeftText: {
    fontSize: iosFontSize(9),
    marginTop: 0,
  },
  cardsGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginBottom: 24,
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: BaseColors.surface,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BaseColors.neutral[200],
    minHeight: 92,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
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
    fontSize: iosFontSize(16),
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    color: BaseColors.text.dark,
    lineHeight: iosFontSize(20),
  },
  cardSubtext: {
    fontSize: iosFontSize(16),
    fontWeight: '600',
    marginTop: 6,
    color: BaseColors.primary,
    textAlign: 'center',
    lineHeight: iosFontSize(20),
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
    height: 12,
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
    fontSize: iosFontSize(14),
    color: BaseColors.primary,
    lineHeight: 18,
  },
  warningText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: iosFontSize(14),
    color: BaseColors.error,
    lineHeight: 18,
  }
});
