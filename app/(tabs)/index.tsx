// app/(tabs)/index.tsx 
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { UI_FEATURE_FLAGS } from '@/constants/featureFlags';
import {
  DEFAULT_HOME_STYLE,
  getHomeLayout,
  HOME_STYLE_STORAGE_KEY,
  isHomeStyle,
  type HomeStyle,
} from '@/constants/homeLayout';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { useStreak } from '@/hooks/useStreak';
import { getOptionalCheckinLocation } from '@/lib/location/checkinLocation';
import {
  cancelTodayReminderAfterCheckin
} from '@/lib/notifications/reminderManager';
import { isLocalAvatarUri } from '@/lib/profile/avatarStorage';
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
  Image,
  LayoutChangeEvent,
  PixelRatio,
  Platform,
  ScrollView as RNScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { iosFontSize } from '@/constants/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CIRCLE_SIZE = Math.min(SCREEN_WIDTH * 0.7, 250);
const STROKE_WIDTH = 40;

const STORAGE_KEY = '@checkin_state';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const WELLNESS_MIN = -2;
const WELLNESS_MAX = 2;
const WELLNESS_DEFAULT = 0;
const WELLNESS_STEPS = WELLNESS_MAX - WELLNESS_MIN + 1;
const SCROLL_OVERFLOW_TOLERANCE = Platform.OS === 'android' ? 40 : 8;
const MODE_ITEM_HEIGHT = 36;
const HOME_STATUS_NOTIFICATION_TYPES = ['contact_checkin', 'welfare_check'] as const;

type HomeStatusNotification = {
  id: string;
  sender_user_id: string | null;
  type: string;
  body: string | null;
  title: string | null;
  data: any;
  created_at: string;
  senderName: string;
  senderAvatarUrl: string | null;
};

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
    th: 'th-TH',
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
  } catch {
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

type SimpleWellnessPickerProps = {
  value: number;
  onChange: (value: number) => void;
  title: string;
  tooltipLabels: Record<number, string>;
  compactness?: 'regular' | 'compact' | 'tight';
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
  const veryLowColor = '#7A5C4D';
  const lowColor = '#6B8DA4';
  const midColor = BaseColors.primary;
  const highColor = '#FFD700';

  if (clampedScore <= -1) {
    const ratio = (clampedScore - WELLNESS_MIN) / Math.max(1, -1 - WELLNESS_MIN);
    return interpolateColor(veryLowColor, lowColor, ratio);
  }

  if (clampedScore === 0) {
    return midColor;
  }

  if (clampedScore < 0) {
    const ratio = clampedScore + 1;
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

const getWellnessStatusMeta = (score?: number | null) => {
  if (typeof score !== 'number') return null;
  const clampedScore = clampWellnessValue(score);
  if (clampedScore <= -2) return { color: '#7A5C4D', backgroundColor: '#F3F3F3', borderColor: '#D0D0D0' };
  if (clampedScore === -1) return { color: '#6B8DA4', backgroundColor: '#E4EFF6', borderColor: '#A8C4D6' };
  if (clampedScore === 0) return { color: BaseColors.primary, backgroundColor: BaseColors.primaryLight, borderColor: BaseColors.primaryBorder };
  if (clampedScore === 1) return { color: '#AFC04A', backgroundColor: '#F4F7E0', borderColor: '#CFDA8A' };
  return { color: '#FFD700', backgroundColor: '#FFF8DC', borderColor: '#E8C64A' };
};

const TRIP_STATUS_EMOJI_PATTERN = /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u;

const parseNotificationData = (value: unknown) => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return typeof value === 'object' ? value as Record<string, any> : {};
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
            size={20}
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
            size={20}
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

const SIMPLE_WELLNESS_OPTIONS = [
  { value: -1, iconName: 'heart-sharp' },
  { value: 0, iconName: 'heart' },
  { value: 1, iconName: 'heart-sharp' },
] as const;

const SimpleWellnessPicker = ({
  value,
  onChange,
  title,
  tooltipLabels,
  compactness = 'regular',
}: SimpleWellnessPickerProps) => {
  const isCompact = compactness !== 'regular';
  const isTight = compactness === 'tight';
  const [activeTooltipValue, setActiveTooltipValue] = useState<number | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionWidth = isTight ? 78 : isCompact ? 84 : 92;
  const optionGap = isCompact ? 10 : 16;
  const tooltipWidth = activeTooltipValue === 0
    ? isCompact ? 120 : 130
    : isCompact ? 142 : 154;

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const showHeartTooltip = useCallback((nextValue: number) => {
    setActiveTooltipValue(nextValue);

    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    tooltipTimeoutRef.current = setTimeout(() => {
      setActiveTooltipValue(null);
      tooltipTimeoutRef.current = null;
    }, 3000);
  }, []);

  return (
    <View style={[
      styles.simpleWellnessGroup,
      isCompact && styles.simpleWellnessGroupCompact,
      isTight && styles.simpleWellnessGroupTight,
    ]}>
      <View style={[
        styles.simpleWellnessCard,
        isCompact && styles.simpleWellnessCardCompact,
        isTight && styles.simpleWellnessCardTight,
      ]}>
        <Text style={[
          styles.simpleWellnessTitle,
          isCompact && styles.simpleWellnessTitleCompact,
          isTight && styles.simpleWellnessTitleTight,
        ]}>
          {title}
        </Text>
        <View style={[
          styles.simpleWellnessOptions,
          isCompact && styles.simpleWellnessOptionsCompact,
        ]}>
          {SIMPLE_WELLNESS_OPTIONS.map((option) => {
            const selected = clampWellnessValue(value) === option.value;
            const isActiveTooltip = activeTooltipValue === option.value;
            const tw = tooltipWidth;
            const ow = optionWidth;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.simpleWellnessOption,
                  option.value < 0 && styles.simpleWellnessOptionLow,
                  option.value === 0 && styles.simpleWellnessOptionNeutral,
                  option.value > 0 && styles.simpleWellnessOptionHigh,
                  isCompact && styles.simpleWellnessOptionCompact,
                  isTight && styles.simpleWellnessOptionTight,
                  selected && styles.simpleWellnessOptionSelected,
                ]}
                onPress={() => {
                  onChange(option.value);
                  showHeartTooltip(option.value);
                  void Haptics.selectionAsync();
                }}
                activeOpacity={0.78}
              >
                {isActiveTooltip && (
                  <View style={[
                    styles.simpleWellnessTooltip,
                    isCompact && styles.simpleWellnessTooltipCompact,
                    { width: tw, left: ow / 2 - tw / 2 },
                  ]}>
                    <Text style={[
                      styles.simpleWellnessTooltipText,
                      isCompact && styles.simpleWellnessTooltipTextCompact,
                    ]}>
                      {tooltipLabels[option.value]}
                    </Text>
                    <View style={styles.simpleWellnessTooltipArrow} />
                  </View>
                )}
                <Ionicons
                  name={option.iconName}
                  size={isCompact ? 28 : 32}
                  color={getWellnessHeartColor(option.value)}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, profile, loading, capabilities } = useAuth();
  const windowDimensions = useWindowDimensions();

  // State
  const [now, setNow] = useState(new Date());
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [lastCheckinUtc, setLastCheckinUtc] = useState<string | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const { streak, refetch: refetchStreak } = useStreak();
  const [, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [fontScale, setFontScale] = useState(1);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [contactsCount, setContactsCount] = useState(0);
  const [wellnessScore, setWellnessScore] = useState(WELLNESS_DEFAULT);
  const [, setSubmittedWellnessScore] = useState(WELLNESS_DEFAULT);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [checkinMode, setCheckinMode] = useState<'home' | 'trip'>('home');
  const [tripStatus, setTripStatus] = useState<string | null>(null);
  const [modeCardWidth, setModeCardWidth] = useState(0);
  const [homeStyle, setHomeStyle] = useState<HomeStyle>(DEFAULT_HOME_STYLE);
  const [latestStatusNotification, setLatestStatusNotification] =
    useState<HomeStatusNotification | null>(null);
  const [latestStatusAvatarLoadFailed, setLatestStatusAvatarLoadFailed] = useState(false);

  const modeScrollRef = useRef<any>(null);
  const latestStatusChannelRef = useRef<any>(null);

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

  // Load home layout preference from Supabase / AsyncStorage
  useEffect(() => {
    const loadHomeStyle = async () => {
      try {
        const saved = await AsyncStorage.getItem(HOME_STYLE_STORAGE_KEY);
        if (isHomeStyle(saved)) {
          setHomeStyle(saved);
        }

        if (!user) return;

        const { data } = await supabase
          .from('user_settings')
          .select('home_style')
          .eq('user_id', user.id)
          .maybeSingle();

        if (isHomeStyle(data?.home_style)) {
          setHomeStyle(data.home_style);
          await AsyncStorage.setItem(HOME_STYLE_STORAGE_KEY, data.home_style);
        } else if (isHomeStyle(saved)) {
          await supabase
            .from('user_settings')
            .upsert(
              { user_id: user.id, home_style: saved, updated_at: new Date().toISOString() },
              { onConflict: 'user_id' }
            );
        }
      } catch (error) {
        console.warn('Failed to load home style:', error);
      }
    };

    loadHomeStyle();
  }, [user]);

  const homeLayout = getHomeLayout(capabilities.isPlus, homeStyle);
  const canUseDetailedHome = homeLayout === 'plus-detailed';
  const canUseWellnessHome = homeLayout !== 'free';

  // Load checkin mode from Supabase / AsyncStorage
  useEffect(() => {
    const loadCheckinMode = async () => {
      try {
        if (!canUseDetailedHome) {
          setCheckinMode('home');
          setTripStatus(null);
          return;
        }
        const saved = await AsyncStorage.getItem('@settings_checkin_mode');
        if (saved === 'home' || saved === 'trip') setCheckinMode(saved);
        if (!user) return;
        const { data } = await supabase
          .from('user_settings')
          .select('checkin_mode')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data?.checkin_mode === 'home' || data?.checkin_mode === 'trip') {
          setCheckinMode(data.checkin_mode as 'home' | 'trip');
          await AsyncStorage.setItem('@settings_checkin_mode', data.checkin_mode);
        }
        // Also load last trip_status from users_latest_checkin
        const { data: checkinData } = await supabase
          .from('users_latest_checkin')
          .select('trip_status')
          .eq('user_id', user.id)
          .maybeSingle();
        if (checkinData?.trip_status) {
          setTripStatus(checkinData.trip_status);
        }
      } catch (_) {}
    };
    loadCheckinMode();
  }, [canUseDetailedHome, user]);

  // Sync drum picker scroll position when checkinMode or card width changes
  useEffect(() => {
    const modeKeys = ['home', 'trip'];
    const idx = modeKeys.indexOf(checkinMode);
    if (idx >= 0 && modeCardWidth > 0) {
      setTimeout(() => {
        modeScrollRef.current?.scrollTo({ x: idx * modeCardWidth, y: 0, animated: false });
      }, 50);
    }
  }, [checkinMode, modeCardWidth]);

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

  const enrichHomeStatusNotification = useCallback(async (notification: any): Promise<HomeStatusNotification> => {
    const parsedData = parseNotificationData(notification.data);
    let senderName =
      parsedData.contactDisplayName ||
      parsedData.senderName ||
      notification.title ||
      'Someone';
    let senderAvatarUrl: string | null = null;

    if (notification.sender_user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', notification.sender_user_id)
        .maybeSingle();

      senderName =
        profileData?.display_name ||
        senderName;
      senderAvatarUrl = profileData?.avatar_url || null;
    }

    return {
      id: notification.id,
      sender_user_id: notification.sender_user_id || null,
      type: notification.type,
      body: notification.body || null,
      title: notification.title || null,
      data: parsedData,
      created_at: notification.created_at,
      senderName,
      senderAvatarUrl,
    };
  }, []);

  const fetchLatestStatusNotification = useCallback(async () => {
    if (!user) {
      setLatestStatusNotification(null);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .in('type', [...HOME_STATUS_NOTIFICATION_TYPES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching latest home status notification:', error);
      return;
    }

    setLatestStatusNotification(data ? await enrichHomeStatusNotification(data) : null);
  }, [enrichHomeStatusNotification, user]);

  useEffect(() => {
    void fetchLatestStatusNotification();
  }, [fetchLatestStatusNotification]);

  useEffect(() => {
    setLatestStatusAvatarLoadFailed(false);
  }, [latestStatusNotification?.senderAvatarUrl]);

  useEffect(() => {
    if (latestStatusChannelRef.current) {
      supabase.removeChannel(latestStatusChannelRef.current);
      latestStatusChannelRef.current = null;
    }

    if (!user) return;

    const channel = supabase
      .channel(`home-status-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!HOME_STATUS_NOTIFICATION_TYPES.includes(payload.new.type as any)) return;

          enrichHomeStatusNotification(payload.new)
            .then(setLatestStatusNotification)
            .catch((error) => {
              console.error('Error enriching realtime home status notification:', error);
            });
        }
      )
      .subscribe();

    latestStatusChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      latestStatusChannelRef.current = null;
    };
  }, [enrichHomeStatusNotification, user]);

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

      const timeZone =
        Localization.getCalendars?.()[0]?.timeZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC';

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
              p_wellness_score: canUseWellnessHome ? wellnessScore : null,
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
            setSubmittedWellnessScore(canUseWellnessHome ? wellnessScore : WELLNESS_DEFAULT);

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

            // Keep trip status aligned with the active home layout so stale detailed-mode state
            // does not leak into simple/free experiences.
            if (canUseDetailedHome && checkinMode === 'trip') {
              supabase
                .from('users_latest_checkin')
                .update({ trip_status: tripStatus })
                .eq('user_id', user.id)
                .then(() => {});
            } else if (!canUseDetailedHome) {
              supabase
                .from('users_latest_checkin')
                .update({ trip_status: null })
                .eq('user_id', user.id)
                .then(() => {});
            }
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
  }, [canUseDetailedHome, canUseWellnessHome, capabilities.canShareLocation, user, t, triggerCheckInAnimation, refetchStreak, wellnessScore]);


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

  const TRIP_STATUS_KEYS = [
    'leaving', 'boarding', 'layover', 'landed', 'on_the_move', 'at_hotel', 'on_trip', 'heading_home', 'trip_ended',
  ] as const;

  const CHECKIN_MODES: { key: 'home' | 'trip'; label: string; icon: string }[] = [
    { key: 'home', label: t('settings.tripMode.home'), icon: 'home-outline' },
    { key: 'trip', label: t('settings.tripMode.trip'), icon: 'airplane' },
  ];

  const greetingInfo = getGreetingInfo(now, t);
  const showLockedPlusWellness = UI_FEATURE_FLAGS.showPlusUpsellUI && !capabilities.isPlus && homeLayout !== 'free';
  const showWellnessModule = canUseWellnessHome || showLockedPlusWellness;
  const displayWellnessScore = canUseWellnessHome ? wellnessScore : WELLNESS_DEFAULT;
  const heartColor = canUseWellnessHome ? getWellnessHeartColor(displayWellnessScore) : BaseColors.primary;
  const activeTripStatusLabel = checkinMode === 'trip' && tripStatus
    ? t(`home.tripMode.statuses.${tripStatus}` as any) as string
    : null;
  const wellnessMessage = canUseWellnessHome
    ? t(getWellnessMessageKey(displayWellnessScore))
    : t('home.everythingIsFine');
  const wellnessEmoji = wellnessMessage.includes('\n') ? wellnessMessage.split('\n')[1] : '';
  const checkedInMessage = activeTripStatusLabel ?? wellnessMessage;
  const [checkedInMsgText, checkedInMsgEmoji] = checkedInMessage.includes('\n')
    ? checkedInMessage.split('\n') as [string, string]
    : [checkedInMessage, wellnessEmoji] as [string, string];
  const chineseFontFamily = getChineseFontFamily(i18n.language);
  const checkedMessageColor =
    checkedInToday && canUseWellnessHome ? BaseColors.surface : BaseColors.surface;
  const shouldScroll = contentHeight > viewportHeight + SCROLL_OVERFLOW_TOLERANCE;
  const simpleDateTimeText = `${formatDateWithTranslation(now, t, i18n.language)} · ${formatTime24h(now, i18n.language)}`;
  const isSimpleHome = homeLayout === 'free' || homeLayout === 'plus-simple';
  const isPlusSimpleHome = homeLayout === 'plus-simple';
  const showDebugResetCheckin = __DEV__;
  const currentFontScale = windowDimensions.fontScale || fontScale;
  const currentScreenWidth = windowDimensions.width || SCREEN_WIDTH;
  const currentScreenHeight = windowDimensions.height || SCREEN_HEIGHT;
  const simpleHomeCompactness: NonNullable<SimpleWellnessPickerProps['compactness']> =
    currentScreenHeight < 700 || currentFontScale >= 1.2
      ? 'tight'
      : currentScreenHeight < 780 || currentFontScale >= 1.1
        ? 'compact'
        : 'regular';
  const isCompactSimpleHome = isSimpleHome && simpleHomeCompactness !== 'regular';
  const isTightSimpleHome = isSimpleHome && simpleHomeCompactness === 'tight';
  const circleSize = isSimpleHome
    ? Math.min(
      currentScreenWidth * (isTightSimpleHome ? 0.56 : isCompactSimpleHome ? 0.62 : 0.68),
      isTightSimpleHome ? 208 : isCompactSimpleHome ? 224 : 250,
    )
    : CIRCLE_SIZE;
  const strokeWidth = isSimpleHome
    ? isTightSimpleHome ? 32 : isCompactSimpleHome ? 36 : STROKE_WIDTH
    : STROKE_WIDTH;
  const maxStroke = strokeWidth + 3;
  const circleRadius = (circleSize - maxStroke) / 2;
  const innerButtonSize = circleSize - strokeWidth;
  const innerButtonOffset = strokeWidth / 2;
  const formatHomeStatusAgo = (createdAt?: string | null) => {
    if (!createdAt) return '';

    const diffSeconds = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000));
    if (diffSeconds < 60) return t('home.status.justNow');

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return t('home.status.minutesAgo', { count: diffMinutes });

    const preciseHours = diffMinutes / 60;
    if (preciseHours < 24) {
      const roundedHalfHour = Math.round(preciseHours * 2) / 2;
      if (Number.isInteger(roundedHalfHour)) {
        return t('home.status.hoursAgo', { count: roundedHalfHour });
      }

      return t('home.status.hoursAgoDecimal', { value: roundedHalfHour.toFixed(1) });
    }

    const diffDays = Math.floor(preciseHours / 24);
    return t('home.status.daysAgo', { count: diffDays });
  };
  const simpleCheckinSummary = checkedInToday && lastCheckinUtc
    ? null
    : t('home.dontForget');
  const simpleCheckinLabel = checkedInToday && lastCheckinUtc
    ? t('home.status.lastCheckinLabel' as any) as string
    : null;
  const simpleCheckinTimeAgo = checkedInToday && lastCheckinUtc
    ? formatHomeStatusAgo(lastCheckinUtc)
    : null;
  const latestStatusTitle = latestStatusNotification
    ? latestStatusNotification.type === 'contact_checkin'
      ? t('home.status.contactCheckedIn', { name: latestStatusNotification.senderName })
      : t('home.status.sentWave', { name: latestStatusNotification.senderName })
    : null;
  const latestStatusTripStatus = latestStatusNotification?.data?.tripStatus;
  const latestStatusTripEmoji = latestStatusTripStatus
    ? (t(`home.tripMode.statuses.${latestStatusTripStatus}` as any) as string).match(TRIP_STATUS_EMOJI_PATTERN)?.[0] ?? null
    : null;
  const latestStatusWellnessScore = latestStatusNotification?.data?.wellnessScore;
  const latestStatusWellnessMeta = getWellnessStatusMeta(latestStatusWellnessScore);
  const latestStatusAvatarUrl =
    latestStatusNotification?.senderAvatarUrl?.trim() &&
    !isLocalAvatarUri(latestStatusNotification.senderAvatarUrl) &&
    !latestStatusAvatarLoadFailed
      ? latestStatusNotification.senderAvatarUrl.trim()
      : '';
  const getWellnessTooltipLabel = (score: number) => {
    const message = t(getWellnessMessageKey(score));
    return message.includes('\n') ? message.split('\n')[0] : message;
  };

  return (
    <SafeAreaView style={[styles.mainContainer, isSimpleHome && styles.simpleMainContainer]} edges={['top']}>
      {/* HEADER - OUTSIDE SCROLLVIEW (FIXED) */}
      <ScreenHeader
        title={profile?.display_name || t('home.welcome')}
        subtitle={greetingInfo.greeting}
        iconName={greetingInfo.iconName as any}
        style={isSimpleHome ? styles.simpleHeader : undefined}
        showGreetingInLine={true}
        rightElement={
          <View style={styles.headerActions}>
            {showDebugResetCheckin ? (
              <TouchableOpacity
                onPress={resetAllState}
                style={styles.headerDebugButton}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={ICON_SIZES.SM} color={BaseColors.error} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              style={styles.profileButton}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={ICON_SIZES.MD} color={BaseColors.primary} />
            </TouchableOpacity>
          </View>
        }
      />
      {isSimpleHome ? (
        <Text style={[
          styles.simpleHeaderDate,
          isCompactSimpleHome && styles.simpleHeaderDateCompact,
        ]}>
          {simpleDateTimeText}
        </Text>
      ) : null}

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
        <Animated.View style={[{ opacity: fadeAnim }, isSimpleHome && styles.simpleAnimatedContent]}>
          {/* DATE & TIME */}
          {!isSimpleHome ? (
            <View style={[styles.dateTimeGroup, styles.groupContainer]}>
              <Text style={styles.timeText}>{formatTime24h(now, i18n.language)}</Text>
              <Text style={styles.dateText}>{formatDateWithTranslation(now, t, i18n.language)}</Text>
            </View>
          ) : null}

          {/* MAIN CHECK-IN */}
          <View style={[
            styles.checkInGroup,
            styles.groupContainer,
            isSimpleHome && styles.simpleCheckInGroup,
            isCompactSimpleHome && styles.simpleCheckInGroupCompact,
            isTightSimpleHome && styles.simpleCheckInGroupTight,
          ]}>
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
                      width: circleSize,
                      height: circleSize,
                    }
                  ]}
                >
                  {/* Outer border */}
                  <View style={[
                    styles.circleBorder,
                    {
                      width: circleSize,
                      height: circleSize,
                      borderRadius: circleSize / 2,
                    }
                  ]} />

                  {/* SVG Container */}
                  <View style={[
                    styles.svgContainer,
                    {
                      width: circleSize,
                      height: circleSize,
                    }
                  ]}>
                    <Svg
                      width={circleSize}
                      height={circleSize}
                      style={{ transform: [{ rotate: '-90deg' }] }}
                      viewBox={`0 0 ${circleSize} ${circleSize}`}
                    >
                      {/* Background circle */}
                      <Circle
                        cx={circleSize / 2}
                        cy={circleSize / 2}
                        r={circleRadius}
                        stroke={BaseColors.primary}
                        strokeWidth={strokeWidth + 3}
                        fill="none"
                      />

                      {/* Progress circle */}
                      {!checkedInToday ? (
                        <Circle
                          cx={circleSize / 2}
                          cy={circleSize / 2}
                          r={circleRadius}
                          stroke={BaseColors.primaryLight}
                          strokeWidth={strokeWidth}
                          fill="none"
                          strokeDasharray={2 * Math.PI * circleRadius}
                          strokeDashoffset={2 * Math.PI * circleRadius * (1 - progress)}
                          opacity={0.7}
                          strokeLinecap="butt"
                        />
                      ) : (
                        <Circle
                          cx={circleSize / 2}
                          cy={circleSize / 2}
                          r={circleRadius}
                          stroke={BaseColors.primary}
                          strokeWidth={strokeWidth}
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
                        width: innerButtonSize,
                        height: innerButtonSize,
                        borderRadius: innerButtonSize / 2,
                        left: innerButtonOffset,
                        top: innerButtonOffset,
                      },
                      checkedInToday ? styles.innerButtonChecked : styles.innerButtonUnchecked,
                      !checkedInToday && capabilities.isPlus && {
                        justifyContent: 'flex-start',
                        paddingTop: innerButtonSize * 0.07,
                        paddingBottom: innerButtonSize * 0.06,
                      },
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
                    <View style={[styles.textContainer, capabilities.isPlus ? { flex: 1 } : { marginTop: 14 }]}>
                      {checkedInToday ? (
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.checkedInText,
                            { color: checkedMessageColor },
                            chineseFontFamily ? { fontFamily: chineseFontFamily } : null,
                          ]}
                        >
                          {checkedInMsgText}
                        </Text>
                      ) : (
                        <>
                          <Text
                            style={[styles.ctaText, fontScale > 1.2 && styles.compactCtaText]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {t('home.pressMeToCheckIn')}
                          </Text>
                          <Text
                            style={[styles.countdownText, fontScale > 1.2 && styles.compactCountdownText]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {formatTimeLeft(remainingMs)}
                          </Text>
                          <Text
                            style={[styles.timeLeftText, fontScale > 1.2 && styles.compactTimeLeftText]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {t('home.timeLeftToday')}
                          </Text>
                        </>
                      )}
                    </View>
                    {checkedInToday && !!checkedInMsgEmoji && (
                      <Text style={styles.checkedInEmoji}>{checkedInMsgEmoji}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
            {isSimpleHome ? (
              <View style={[
                styles.simpleCheckinInfoRow,
                isCompactSimpleHome && styles.simpleCheckinInfoRowCompact,
              ]}>
                <Ionicons
                  name={checkedInToday ? 'checkmark-circle' : 'alert-circle'}
                  size={isCompactSimpleHome ? 16 : 18}
                  color={checkedInToday ? BaseColors.primaryDark : BaseColors.warning}
                  style={styles.simpleCheckinInfoIcon}
                />
                <Text style={[
                  styles.simpleCheckinInfoText,
                  isCompactSimpleHome && styles.simpleCheckinInfoTextCompact,
                  { color: checkedInToday ? BaseColors.primaryDark : BaseColors.warning },
                ]}>
                  {simpleCheckinLabel ? `${simpleCheckinLabel} ${simpleCheckinTimeAgo}` : simpleCheckinSummary}
                </Text>
              </View>
            ) : null}
          </View>

          {isPlusSimpleHome ? (
            <SimpleWellnessPicker
              value={wellnessScore}
              onChange={setWellnessScore}
              title={t('home.wellnessPrompt')}
              tooltipLabels={{
                [-1]: getWellnessTooltipLabel(-1),
                [0]: getWellnessTooltipLabel(0),
                [1]: getWellnessTooltipLabel(1),
              }}
              compactness={simpleHomeCompactness}
            />
          ) : null}

          {isSimpleHome ? (
            <View style={[
              styles.simpleStatusDock,
              isCompactSimpleHome && styles.simpleStatusDockCompact,
            ]}>
              <View style={[
                styles.simpleStatusGroup,
                isCompactSimpleHome && styles.simpleStatusGroupCompact,
              ]}>
                <View style={[
                  styles.simpleStatusCard,
                  isCompactSimpleHome && styles.simpleStatusCardCompact,
                  isTightSimpleHome && styles.simpleStatusCardTight,
                ]}>
                  {latestStatusNotification ? (
                    <>
                      {latestStatusAvatarUrl ? (
                        <Image
                          source={{ uri: latestStatusAvatarUrl }}
                          style={[
                            styles.simpleStatusAvatar,
                            isCompactSimpleHome && styles.simpleStatusAvatarCompact,
                          ]}
                          onError={() => setLatestStatusAvatarLoadFailed(true)}
                        />
                      ) : (
                        <Ionicons
                          name="person-circle"
                          size={isCompactSimpleHome ? 46 : 52}
                          color={BaseColors.neutral[300]}
                          style={[
                            styles.simpleStatusAvatarFallback,
                            isCompactSimpleHome && styles.simpleStatusAvatarFallbackCompact,
                          ]}
                        />
                      )}
                      <View style={styles.simpleStatusTextGroup}>
                        <Text style={[
                          styles.simpleStatusTitle,
                          isCompactSimpleHome && styles.simpleStatusTitleCompact,
                        ]} numberOfLines={1}>
                          {latestStatusTitle}
                        </Text>
                        <Text style={[
                          styles.simpleStatusSubtitle,
                          isCompactSimpleHome && styles.simpleStatusSubtitleCompact,
                        ]} numberOfLines={1}>
                          {formatHomeStatusAgo(latestStatusNotification.created_at)}
                        </Text>
                      </View>
                      <View style={styles.simpleStatusEmojiGroup}>
                        {latestStatusTripEmoji ? (
                          <View style={[
                            styles.simpleStatusEmojiCircle,
                            isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                            styles.simpleStatusTripEmojiCircle,
                          ]}>
                            <Text style={[
                              styles.simpleStatusEmoji,
                              isCompactSimpleHome && styles.simpleStatusEmojiCompact,
                            ]}>{latestStatusTripEmoji}</Text>
                          </View>
                        ) : null}
                        {latestStatusWellnessMeta ? (
                          <View style={[
                            styles.simpleStatusEmojiCircle,
                            isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                            {
                              backgroundColor: latestStatusWellnessMeta.backgroundColor,
                              borderColor: latestStatusWellnessMeta.borderColor,
                              borderWidth: 1,
                            },
                          ]}>
                            <Ionicons
                              name="heart"
                              size={isCompactSimpleHome ? 22 : 26}
                              color={latestStatusWellnessMeta.color}
                            />
                          </View>
                        ) : null}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[
                        styles.simpleStatusIcon,
                        isCompactSimpleHome && styles.simpleStatusIconCompact,
                      ]}>
                        <Ionicons
                          name={checkedInToday ? 'checkmark' : 'heart'}
                          size={isCompactSimpleHome ? 20 : 22}
                          color={checkedInToday ? BaseColors.primary : BaseColors.highlight}
                        />
                      </View>
                      <View style={styles.simpleStatusTextGroup}>
                        <Text style={[
                          styles.simpleStatusTitle,
                          isCompactSimpleHome && styles.simpleStatusTitleCompact,
                        ]}>
                          {checkedInToday ? t('home.simple.statusChecked') : t('home.simple.statusReady')}
                        </Text>
                        <Text style={[
                          styles.simpleStatusSubtitle,
                          isCompactSimpleHome && styles.simpleStatusSubtitleCompact,
                        ]}>
                          {contactsCount > 0
                            ? t('home.contacts', { count: contactsCount })
                            : t('home.simple.statusQuiet')}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>
          ) : null}

          {!isSimpleHome && showWellnessModule ? (
            <View style={[styles.wellnessGroup, styles.groupContainer]}>
              <WellnessSlider
                value={canUseWellnessHome ? wellnessScore : WELLNESS_DEFAULT}
                onChange={setWellnessScore}
                disabled={!canUseWellnessHome}
                onLockedPress={handleWellnessUpgradePress}
              />
            </View>
          ) : null}

          {canUseDetailedHome && <View style={[styles.tripStatusGroup, styles.groupContainer]}>
            <View style={styles.tripStatusRow}>
            <RNScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tripPillsRow}
              scrollEnabled={checkinMode === 'trip'}
            >
              {TRIP_STATUS_KEYS.map((key) => {
                const isActive = tripStatus === key;
                const isTrip = checkinMode === 'trip';
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tripPill, isActive && styles.tripPillActive, !isTrip && styles.tripPillDisabled]}
                    onPress={() => isTrip && setTripStatus(isActive ? null : key)}
                    activeOpacity={isTrip ? 0.75 : 1}
                  >
                    <Text style={[styles.tripPillText, isActive && styles.tripPillTextActive, !isTrip && styles.tripPillTextDisabled]}>
                      {t(`home.tripMode.statuses.${key}` as any) as string}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </RNScrollView>
            <View style={styles.tripScrollHint}>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={checkinMode === 'trip' ? BaseColors.primary : BaseColors.neutral[300]}
              />
            </View>
            </View>
          </View>}

          {/* ACTION CARDS */}
          {!isSimpleHome ? (
          <View style={[styles.cardsGroup, styles.groupContainer]}>
            <View style={styles.cardsContainer}>
              {canUseDetailedHome && <View style={styles.card}>
                <View style={styles.cardIcon}>
                  <View style={[styles.iconContainerBase, styles.activityIconContainer]}>
                    <Ionicons
                      name={checkinMode === 'trip' ? 'airplane' : 'home-outline'}
                      size={ICON_SIZES.LG}
                      color={BaseColors.primary}
                    />
                  </View>
                </View>
                <Text style={styles.cardLabel}>{t('settings.tripMode.title')}</Text>
                <View style={styles.modeDrumWrapper}>
                  <TouchableOpacity
                    onPress={() => {
                      const modeKeys = ['home', 'trip'] as const;
                      const cur = modeKeys.indexOf(checkinMode);
                      const prev = Math.max(0, cur - 1);
                      modeScrollRef.current?.scrollTo({ x: prev * modeCardWidth, y: 0, animated: true });
                      const selected = CHECKIN_MODES[prev];
                      if (selected && selected.key !== checkinMode) {
                        setCheckinMode(selected.key);
                        if (selected.key === 'home') setTripStatus(null);
                        AsyncStorage.setItem('@settings_checkin_mode', selected.key);
                        supabase.from('user_settings').upsert(
                          { user_id: user?.id, checkin_mode: selected.key, updated_at: new Date().toISOString() },
                          { onConflict: 'user_id' }
                        ).then(() => {});
                      }
                    }}
                    style={styles.modeDrumArrow}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="chevron-back" size={14} color={checkinMode === 'home' ? BaseColors.neutral[300] : BaseColors.primary} />
                  </TouchableOpacity>
                <View
                  style={styles.modeDrumOuter}
                  onLayout={(e) => setModeCardWidth(e.nativeEvent.layout.width)}
                >
                  <RNScrollView
                    ref={modeScrollRef}
                    style={styles.modeDrumScroller}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={modeCardWidth}
                    decelerationRate="fast"
                    bounces={false}
                    contentContainerStyle={styles.modeDrumContent}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / (modeCardWidth || 1));
                      const clamped = Math.max(0, Math.min(CHECKIN_MODES.length - 1, idx));
                      const selected = CHECKIN_MODES[clamped];
                      if (selected && selected.key !== checkinMode) {
                        setCheckinMode(selected.key);
                        if (selected.key === 'home') setTripStatus(null);
                        AsyncStorage.setItem('@settings_checkin_mode', selected.key);
                        supabase.from('user_settings').upsert(
                          { user_id: user?.id, checkin_mode: selected.key, updated_at: new Date().toISOString() },
                          { onConflict: 'user_id' }
                        ).then(() => {});
                      }
                    }}
                  >
                    {CHECKIN_MODES.map(({ key, label }) => (
                      <View key={key} style={[styles.modeDrumItem, { width: modeCardWidth }]}>
                        <Text style={[styles.modeDrumText, checkinMode === key && styles.modeDrumTextActive]}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </RNScrollView>
                </View>
                  <TouchableOpacity
                    onPress={() => {
                      const modeKeys = ['home', 'trip'] as const;
                      const cur = modeKeys.indexOf(checkinMode);
                      const next = Math.min(CHECKIN_MODES.length - 1, cur + 1);
                      modeScrollRef.current?.scrollTo({ x: next * modeCardWidth, y: 0, animated: true });
                      const selected = CHECKIN_MODES[next];
                      if (selected && selected.key !== checkinMode) {
                        setCheckinMode(selected.key);
                        if (selected.key === 'home') setTripStatus(null);
                        AsyncStorage.setItem('@settings_checkin_mode', selected.key);
                        supabase.from('user_settings').upsert(
                          { user_id: user?.id, checkin_mode: selected.key, updated_at: new Date().toISOString() },
                          { onConflict: 'user_id' }
                        ).then(() => {});
                      }
                    }}
                    style={styles.modeDrumArrow}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="chevron-forward" size={14} color={checkinMode === 'trip' ? BaseColors.neutral[300] : BaseColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>}
            </View>
          </View>
          ) : null}


          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const GROUP_GAP = 10;

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: BaseColors.background,
  },
  simpleMainContainer: {
    backgroundColor: '#F7F3EA',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerDebugButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BaseColors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BaseColors.errorBorder,
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
  simpleHeader: {
    marginBottom: 0,
    paddingTop: Platform.OS === 'ios' ? 22 : 16,
  },
  simpleHeaderDate: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: 4,
    marginBottom: 8,
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(21),
    color: BaseColors.neutral[500],
    fontWeight: '700',
  },
  simpleHeaderDateCompact: {
    marginBottom: 4,
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(19),
  },
  simpleAnimatedContent: {
    flexGrow: 1,
  },
  dateTimeGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingTop: Platform.OS === 'ios' ? 6 : 2,
  },
  timeText: {
    fontSize: iosFontSize(26),
    lineHeight: iosFontSize(30),
    fontWeight: '700',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },
  dateText: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(16),
    color: BaseColors.neutral[500],
    marginTop: 2,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  checkInGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  simpleCheckInGroup: {
    flex: 1,
    minHeight: 270,
    paddingTop: 12,
    paddingBottom: 10,
  },
  simpleCheckInGroupCompact: {
    minHeight: 245,
    paddingTop: 4,
    paddingBottom: 6,
  },
  simpleCheckInGroupTight: {
    minHeight: 225,
    paddingTop: 0,
    paddingBottom: 2,
  },
  simpleWellnessGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: -2,
    marginBottom: 12,
  },
  simpleWellnessGroupCompact: {
    marginBottom: 8,
  },
  simpleWellnessGroupTight: {
    marginTop: -6,
    marginBottom: 6,
  },
  simpleWellnessCard: {
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#EEF8F3',
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  simpleWellnessCardCompact: {
    paddingVertical: 10,
  },
  simpleWellnessCardTight: {
    paddingVertical: 8,
    borderRadius: 18,
  },
  simpleWellnessTitle: {
    fontSize: iosFontSize(18),
    lineHeight: iosFontSize(23),
    fontWeight: '800',
    color: BaseColors.text.dark,
    textAlign: 'center',
    marginBottom: 10,
  },
  simpleWellnessTitleCompact: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(21),
    marginBottom: 8,
  },
  simpleWellnessTitleTight: {
    marginBottom: 6,
  },
  simpleWellnessTooltip: {
    position: 'absolute',
    bottom: 64,
    minHeight: 30,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: BaseColors.surface,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    alignItems: 'center',
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
  simpleWellnessTooltipCompact: {
    bottom: 56,
    minHeight: 28,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  simpleWellnessTooltipText: {
    width: '100%',
    flexShrink: 1,
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(20),
    fontWeight: '700',
    color: BaseColors.neutral[600],
    textAlign: 'center',
    flexWrap: 'wrap',
    includeFontPadding: false,
  },
  simpleWellnessTooltipTextCompact: {
    fontSize: iosFontSize(11),
    lineHeight: iosFontSize(16),
  },
  simpleWellnessTooltipArrow: {
    position: 'absolute',
    bottom: -5,
    width: 10,
    height: 10,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BaseColors.primaryBorder,
    backgroundColor: BaseColors.surface,
    transform: [{ rotate: '45deg' }],
  },
  simpleWellnessOptions: {
    width: '82%',
    maxWidth: 328,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    overflow: 'visible',
    zIndex: 2,
  },
  simpleWellnessOptionsCompact: {
    width: '78%',
    maxWidth: 286,
    gap: 10,
  },
  simpleWellnessOption: {
    flexGrow: 0,
    flexShrink: 0,
    width: 92,
    minHeight: 54,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  simpleWellnessOptionLow: {
    backgroundColor: '#EAF6FB',
  },
  simpleWellnessOptionNeutral: {
    backgroundColor: '#EEF8F3',
  },
  simpleWellnessOptionHigh: {
    backgroundColor: '#FFF0F3',
  },
  simpleWellnessOptionCompact: {
    width: 84,
    minHeight: 48,
    borderRadius: 18,
  },
  simpleWellnessOptionTight: {
    width: 78,
    minHeight: 44,
    borderRadius: 16,
  },
  simpleWellnessOptionSelected: {
    borderColor: BaseColors.primary,
    backgroundColor: '#FBFFFD',
  },
  wellnessGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  tripStatusGroup: {
    paddingLeft: SCREEN_PADDING.horizontal,
  },
  tripStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripScrollHint: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripPillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: SCREEN_PADDING.horizontal,
  },
  tripPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    backgroundColor: BaseColors.surface,
  },
  tripPillActive: {
    backgroundColor: BaseColors.primary,
    borderColor: BaseColors.primary,
  },
  tripPillText: {
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(20),
    fontWeight: '500',
    color: BaseColors.text.dark,
  },
  tripPillTextActive: {
    color: BaseColors.surface,
  },
  tripPillDisabled: {
    borderColor: BaseColors.neutral[200],
    backgroundColor: BaseColors.surface,
    opacity: 0.4,
  },
  tripPillTextDisabled: {
    color: BaseColors.neutral[400],
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
    paddingVertical: 5,
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
    width: 24,
    height: 24,
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
    fontSize: 22,
    lineHeight: 26,
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
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  checkedInEmoji: {
    fontSize: 36,
    textAlign: 'center',
    lineHeight: 58,
    width: '100%',
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
    justifyContent: 'center',
    borderWidth: 3,
    margin: 0,
    padding: 0,
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
    minHeight: ICON_SIZES.SUPER_HUGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
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
    justifyContent: 'center',
    paddingHorizontal: 14,
    maxWidth: '100%',
    width: '100%',
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
  simpleStatusDock: {
    marginTop: 'auto',
    paddingTop: 12,
    paddingBottom: 2,
    backgroundColor: 'rgba(238, 248, 243, 0.24)',
  },
  simpleStatusDockCompact: {
    paddingTop: 9,
  },
  simpleStatusDockHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(94, 121, 108, 0.22)',
    marginBottom: 10,
  },
  simpleStatusGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginBottom: 12,
  },
  simpleStatusGroupCompact: {
    marginBottom: 8,
  },
  simpleCheckinInfoRow: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  simpleCheckinInfoRowCompact: {
    marginTop: 6,
  },
  simpleCheckinInfoIcon: {
    flexShrink: 0,
  },
  simpleCheckinInfoText: {
    flex: 1,
    minWidth: 0,
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(19),
    fontWeight: '600',
    textAlign: 'center',
  },
  simpleCheckinInfoTextCompact: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(18),
  },
  simpleStatusCard: {
    minHeight: 76,
    borderRadius: 20,
    backgroundColor: '#EEF8F3',
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  simpleStatusCardCompact: {
    minHeight: 68,
    paddingVertical: 8,
  },
  simpleStatusCardTight: {
    minHeight: 62,
    borderRadius: 18,
  },
  simpleStatusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BaseColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  simpleStatusIconCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
  },
  simpleStatusAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: BaseColors.neutral[100],
    borderWidth: 2,
    borderColor: BaseColors.primaryLight,
  },
  simpleStatusAvatarCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 10,
  },
  simpleStatusAvatarFallback: {
    marginRight: 12,
  },
  simpleStatusAvatarFallbackCompact: {
    marginRight: 10,
  },
  simpleStatusTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  simpleStatusTitle: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(20),
    fontWeight: '800',
    color: BaseColors.primaryDark,
  },
  simpleStatusTitleCompact: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(18),
  },
  simpleStatusSubtitle: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(18),
    color: BaseColors.neutral[500],
    marginTop: 2,
    fontWeight: '600',
  },
  simpleStatusSubtitleCompact: {
    fontSize: iosFontSize(12),
    lineHeight: iosFontSize(16),
    marginTop: 1,
  },
  simpleStatusEmojiGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginLeft: 10,
    minWidth: 32,
  },
  simpleStatusEmojiCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleStatusEmojiCircleCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  simpleStatusTripEmojiCircle: {
    backgroundColor: BaseColors.primaryLight,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
  },
  simpleStatusEmoji: {
    fontSize: iosFontSize(26),
    lineHeight: iosFontSize(30),
  },
  simpleStatusEmojiCompact: {
    fontSize: iosFontSize(22),
    lineHeight: iosFontSize(26),
  },
  cardsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCardGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  modeCard: {
    backgroundColor: BaseColors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BaseColors.neutral[200],
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  modeCardLabel: {
    fontSize: iosFontSize(14),
    fontWeight: '600',
    color: BaseColors.text.dark,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  streakRowText: {
    fontSize: iosFontSize(14),
    fontWeight: '600',
    color: BaseColors.text.dark,
  },
  card: {
    flex: 1,
    backgroundColor: BaseColors.surface,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BaseColors.neutral[200],
    minHeight: 76,
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
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: iosFontSize(16),
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
    color: BaseColors.text.dark,
    lineHeight: iosFontSize(18),
  },
  cardSubtext: {
    fontSize: iosFontSize(16),
    fontWeight: '600',
    marginTop: 4,
    color: BaseColors.primary,
    textAlign: 'center',
    lineHeight: iosFontSize(18),
  },
  iconContainerBase: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActive: {
    backgroundColor: BaseColors.primary,
    borderColor: BaseColors.primary,
  },
  cardLabelActive: {
    color: BaseColors.surface,
  },
  cardSubtextActive: {
    color: BaseColors.surface,
    opacity: 0.85,
  },
  activityIconContainer: {
    backgroundColor: '#EDF7F4',
  },
  tripIconContainer: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  modeDrumWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
  },
  modeDrumArrow: {
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeDrumOuter: {
    flex: 1,
    backgroundColor: BaseColors.primaryLight,
    borderRadius: 8,
    overflow: 'hidden',
  },
  modeDrumScroller: {
    height: MODE_ITEM_HEIGHT,
    width: '100%',
  },

  modeDrumContent: {
  },
  modeDrumItem: {
    height: MODE_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeDrumText: {
    fontSize: iosFontSize(13),
    fontWeight: '500',
    color: BaseColors.text.dark,
  },
  modeDrumTextActive: {
    opacity: 1,
    fontWeight: '700',
    color: BaseColors.primary,
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
