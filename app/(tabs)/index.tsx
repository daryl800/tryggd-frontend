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
import { resetOnboarding } from '@/lib/onboarding/state';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  AppState,
  Dimensions,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Linking,
  Modal,
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
import { useEntitlement } from '@/lib/entitlements/useEntitlement';
import { useContactCheckins } from '@/contexts/ContactCheckinsContext';
import { supabase } from '../../lib/supabase';
import { iosFontSize } from '@/constants/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STROKE_WIDTH = 40;

const STORAGE_KEY = '@checkin_state';
const HOME_PRESENCE_STORAGE_KEY = '@settings_home_presence';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const WELLNESS_MIN = -2;
const WELLNESS_MAX = 2;
const WELLNESS_DEFAULT = 0;
const WELLNESS_STEPS = WELLNESS_MAX - WELLNESS_MIN + 1;
const SCROLL_OVERFLOW_TOLERANCE = Platform.OS === 'android' ? 40 : 8;
const HOME_STATUS_NOTIFICATION_TYPES = ['welfare_check', 'emergency_message', 'checkin_response'] as const;
type HomePresence = 'chilling' | 'home' | 'outside' | 'busy' | 'relaxing' | 'gathering' | 'on_call' | 'eating' | 'exhausted' | 'sleepy' | 'daydreaming' | 'having_fun' | 'playing_sport' | 'watching_movie' | 'goodmorning' | 'goodafternoon' | 'goodnight';
type ReachOutStatus = 'call_now' | 'call_available';

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

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const EMOJI_CHAR_PATTERN = /[\p{Extended_Pictographic}\uFE0F]/gu;

const stripEmojiFromLabel = (value: string) =>
  value
    .replace(EMOJI_CHAR_PATTERN, '')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n');

const formatStatusLabelWithBreaks = (value: string) =>
  value.replace(/\s*[/／]\s*/g, ' /\n');

const getVisualTextUnits = (value: string) =>
  Array.from(value).reduce((total, char) => {
    if (/\s/.test(char)) return total + 0.28;
    if (/[\/／]/.test(char)) return total + 0.45;
    if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(char)) return total + 1.85;
    if (/[A-ZÅÄÖ]/.test(char)) return total + 1.02;
    if (/[a-zåäö]/.test(char)) return total + 0.9;
    if (/[0-9]/.test(char)) return total + 0.84;
    return total + 0.62;
  }, 0);

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

type WellnessOption = { value: number; iconName: 'heart' | 'heart-sharp' };
type WellnessSliderProps = {
  value: number;
  onChange: (value: number) => void;
  tooltipText: string;
  disabled?: boolean;
  onLockedPress?: () => void;
};

type WellnessButtonPickerProps = {
  value: number;
  onChange: (value: number) => void;
  title: string;
  options: readonly WellnessOption[];
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

const SIMPLE_WELLNESS_OPTIONS: readonly WellnessOption[] = [
  { value: -1, iconName: 'heart-sharp' },
  { value: 0, iconName: 'heart' },
  { value: 1, iconName: 'heart-sharp' },
] as const;

const HOME_PRESENCE_OPTIONS: readonly HomePresence[] = ['goodmorning', 'goodafternoon', 'home', 'outside', 'eating', 'chilling', 'gathering', 'on_call', 'daydreaming', 'busy', 'exhausted', 'sleepy', 'having_fun', 'playing_sport', 'watching_movie', 'goodnight'] as const;

const isHomePresence = (value: unknown): value is HomePresence =>
  typeof value === 'string' && (HOME_PRESENCE_OPTIONS as readonly string[]).includes(value);
const REACH_OUT_STATUS_OPTIONS: readonly ReachOutStatus[] = ['call_now', 'call_available'] as const;
const isReachOutStatus = (value: unknown): value is ReachOutStatus =>
  value === 'call_now' || value === 'call_available';

const WellnessSlider = ({ value, onChange, tooltipText, disabled = false, onLockedPress }: WellnessSliderProps) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const lastValueRef = useRef(value);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastValueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const revealTooltip = useCallback(() => {
    setShowTooltip(true);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
      tooltipTimeoutRef.current = null;
    }, 3000);
  }, []);

  const updateValueFromEvent = useCallback(
    (event: GestureResponderEvent) => {
      const nextValue = getWellnessValueFromPosition(event.nativeEvent.locationX, trackWidth);

      revealTooltip();
      if (nextValue === lastValueRef.current) return;

      lastValueRef.current = nextValue;
      onChange(nextValue);
      void Haptics.selectionAsync();
    },
    [onChange, revealTooltip, trackWidth]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const normalizedValue = (value - WELLNESS_MIN) / (WELLNESS_STEPS - 1);
  const handleLeft = trackWidth > 0 ? normalizedValue * trackWidth : 0;
  const handleHeartColor = getWellnessHeartColor(value);
  const sliderTooltipWidth = 154;
  const sliderTooltipLeft = trackWidth > 0
    ? Math.max(0, Math.min(trackWidth - sliderTooltipWidth, handleLeft - sliderTooltipWidth / 2))
    : 0;

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
          onPress={disabled ? onLockedPress : () => {
            onChange(WELLNESS_MIN);
            revealTooltip();
          }}
          activeOpacity={0.7}
          style={styles.wellnessEdgeButton}
        >
          <Ionicons
            name="heart-sharp"
            size={20}
            color={getWellnessHeartColor(WELLNESS_MIN)}
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
          {showTooltip ? (
            <View
              pointerEvents="none"
              style={[
                styles.wellnessSliderTooltip,
                { width: sliderTooltipWidth, left: sliderTooltipLeft },
              ]}
            >
              <Text style={styles.wellnessSliderTooltipText}>
                {tooltipText}
              </Text>
              <View style={styles.wellnessSliderTooltipArrow} />
            </View>
          ) : null}
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
            <Ionicons
              name={value >= 0 ? 'heart' : 'heart-sharp'}
              size={20}
              color={handleHeartColor}
            />
          </View>
        </View>
        <TouchableOpacity
          onPress={disabled ? onLockedPress : () => {
            onChange(WELLNESS_MAX);
            revealTooltip();
          }}
          activeOpacity={0.7}
          style={styles.wellnessEdgeButton}
        >
          <Ionicons
            name="heart-sharp"
            size={20}
            color={getWellnessHeartColor(WELLNESS_MAX)}
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

const WellnessButtonPicker = ({
  value,
  onChange,
  title,
  options,
  tooltipLabels,
  compactness = 'regular',
}: WellnessButtonPickerProps) => {
  const isCompact = compactness !== 'regular';
  const isTight = compactness === 'tight';
  const isDense = options.length > 3;
  const [activeTooltipValue, setActiveTooltipValue] = useState<number | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseOptionWidth = isTight ? 78 : isCompact ? 84 : 92;
  const optionWidth = isDense ? Math.round(baseOptionWidth * 0.62) : baseOptionWidth;
  const optionGap = isDense ? (isCompact ? 6 : 8) : isCompact ? 10 : 16;
  const iconSize = isDense ? (isCompact ? 22 : 24) : isCompact ? 28 : 32;
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
          { gap: optionGap },
        ]}>
          {options.map((option) => {
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
                  { width: ow },
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
                  size={iconSize}
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
  const { user, profile, loading, capabilities, refreshProfile } = useAuth();
  const { isPlusPreviewOpen, hasActivatedPilotPreview, hasPaidPlusAccess, campaignId } = useEntitlement();
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
  const [moodScore, setMoodScore] = useState(WELLNESS_DEFAULT);
  const [, setSubmittedMoodScore] = useState(WELLNESS_DEFAULT);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [checkinMode, setCheckinMode] = useState<'home' | 'trip' | 'reach_out'>('home');
  const [tripPresence, setTripPresence] = useState<string | null>(null);
  const [homePresence, setHomePresence] = useState<HomePresence>('chilling');
  const [reachOutPresence, setReachOutPresence] = useState<ReachOutStatus>('call_now');
  const [homeStyle, setHomeStyle] = useState<HomeStyle>(DEFAULT_HOME_STYLE);
  const [latestStatusNotification, setLatestStatusNotification] =
    useState<HomeStatusNotification | null>(null);
  const [latestStatusAvatarLoadFailed, setLatestStatusAvatarLoadFailed] = useState(false);
  const [presenceBadgeTooltipVisible, setLatestStatusBadgeTooltipVisible] = useState(false);
  const [moodTooltipVisible, setLatestStatusWellnessTooltipVisible] = useState(false);
  const [pilotDialogDismissed, setPilotDialogDismissed] = useState(false);

  // Shared contact check-in data (one fetch/subscription shared with Activity)
  const {
    checkins: contactCheckins,
    profiles: contactProfiles,
    locationMap: contactLocationMap,
    refresh: refreshCheckins,
  } = useContactCheckins();

  // Derived from shared context — most recent contact check-in for the status bar
  const latestCheckinStatus = useMemo<HomeStatusNotification | null>(() => {
    const latest = contactCheckins.find((c) => c.last_checked_in_utc != null);
    if (!latest || !latest.last_checked_in_utc) return null;
    const profile = contactProfiles.get(latest.user_id);
    const normalizedTs = new Date(latest.last_checked_in_utc).toISOString();
    const loc = contactLocationMap.get(`${latest.user_id}:${normalizedTs}`) ?? null;
    return {
      id: `checkin-${latest.user_id}`,
      sender_user_id: latest.user_id,
      type: 'contact_checkin',
      body: null,
      title: null,
      data: {
        tripStatus: latest.trip_status || null,
        homePresence: latest.home_presence || null,
        reachOutStatus: latest.reach_out_status || null,
        wellnessScore: latest.wellness_score ?? null,
        location: loc
          ? { latitude: loc.latitude, longitude: loc.longitude, accuracyMeters: loc.accuracyMeters }
          : null,
      },
      created_at: latest.last_checked_in_utc,
      senderName: profile?.display_name || latest.display_name || 'Someone',
      senderAvatarUrl: profile?.avatar_url || null,
    };
  }, [contactCheckins, contactProfiles, contactLocationMap]);

  const latestStatusChannelRef = useRef<any>(null);
  const fetchLatestStatusNotificationRef = useRef<() => void>(() => {});
  const presenceBadgeTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moodTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            setMoodScore(WELLNESS_DEFAULT);
            setSubmittedMoodScore(WELLNESS_DEFAULT);
          }
        } else {
          setCheckedInToday(false);
          setShowResetButton(false);
          setLastCheckinUtc(null);
          setMoodScore(WELLNESS_DEFAULT);
          setSubmittedMoodScore(WELLNESS_DEFAULT);
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
  const loadHomeStyle = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    loadHomeStyle();
  }, [loadHomeStyle]);

  useEffect(() => {
    if (!campaignId) return;
    const key = `@tryggd_pilot_plus_preview_dismissed_${campaignId}`;
    AsyncStorage.getItem(key).then((val) => setPilotDialogDismissed(val === 'true'));
  }, [campaignId]);

  const handleActivatePilotPreview = useCallback(async () => {
    await supabase.rpc('activate_pilot_preview');
    await refreshProfile();
  }, [refreshProfile]);

  const handleDismissPilotDialog = useCallback(async () => {
    if (!campaignId) return;
    const key = `@tryggd_pilot_plus_preview_dismissed_${campaignId}`;
    await AsyncStorage.setItem(key, 'true');
    setPilotDialogDismissed(true);
  }, [campaignId]);

  const homeLayout = getHomeLayout(capabilities.isPlus, homeStyle);
  const canUseEnhancedHome = homeLayout === 'plus-enhanced';
  const canUseWellnessHome = homeLayout !== 'free';

  // Load checkin mode from Supabase / AsyncStorage
  useEffect(() => {
    const loadCheckinMode = async () => {
      try {
        if (!canUseEnhancedHome) {
          setCheckinMode('home');
          setTripPresence(null);
          return;
        }
        const saved = await AsyncStorage.getItem('@settings_checkin_mode');
        if (saved === 'home' || saved === 'trip' || saved === 'reach_out') setCheckinMode(saved);
        if (!user) return;
        const { data } = await supabase
          .from('user_settings')
          .select('checkin_mode')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data?.checkin_mode === 'home' || data?.checkin_mode === 'trip' || data?.checkin_mode === 'reach_out') {
          setCheckinMode(data.checkin_mode as 'home' | 'trip' | 'reach_out');
          await AsyncStorage.setItem('@settings_checkin_mode', data.checkin_mode);
        }
        // Also load last trip_status / home_presence / reach_out_status from users_latest_checkin
        const { data: checkinData } = await supabase
          .from('users_latest_checkin')
          .select('trip_status, home_presence, reach_out_status')
          .eq('user_id', user.id)
          .maybeSingle();
        if (checkinData?.trip_status) {
          setTripPresence(checkinData.trip_status);
        }
        if (isHomePresence(checkinData?.home_presence)) {
          setHomePresence(checkinData.home_presence);
          await AsyncStorage.setItem(HOME_PRESENCE_STORAGE_KEY, checkinData.home_presence);
        }
        if (isReachOutStatus(checkinData?.reach_out_status)) {
          setReachOutPresence(checkinData.reach_out_status);
        }
      } catch (_) {}
    };
    loadCheckinMode();
  }, [canUseEnhancedHome, user]);

  useEffect(() => {
    const loadHomePresence = async () => {
      try {
        if (!canUseEnhancedHome) {
          setHomePresence('chilling');
          return;
        }

        const saved = await AsyncStorage.getItem(HOME_PRESENCE_STORAGE_KEY);
        if (isHomePresence(saved)) {
          setHomePresence(saved);
        }
      } catch {}
    };

    loadHomePresence();
  }, [canUseEnhancedHome]);

  const handleCheckinModeChange = useCallback(async (mode: 'home' | 'trip' | 'reach_out') => {
    if (mode === checkinMode) return;
    void Haptics.selectionAsync();
    setCheckinMode(mode);
    if (mode !== 'trip') setTripPresence(null);
    await AsyncStorage.setItem('@settings_checkin_mode', mode);
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          checkin_mode: mode,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }
  }, [checkinMode, user]);

  const handleReachOutPresenceChange = useCallback((value: ReachOutStatus) => {
    if (value === reachOutPresence) return;
    void Haptics.selectionAsync();
    setReachOutPresence(value);
  }, [reachOutPresence]);

  const handleHomePresenceChange = useCallback(async (value: HomePresence) => {
    if (value === homePresence) return;
    void Haptics.selectionAsync();
    setHomePresence(value);
    await AsyncStorage.setItem(HOME_PRESENCE_STORAGE_KEY, value);
  }, [homePresence]);

  // Fetch contacts count
  const fetchContactsCount = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;

    const { data, count, error } = await supabase
      .from('contacts')
      .select('contact_user_id', { count: 'exact' })
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
    setMoodScore(WELLNESS_DEFAULT);
    setSubmittedMoodScore(WELLNESS_DEFAULT);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const resetOnboardingFlow = useCallback(async () => {
    await resetOnboarding();
    router.replace('/onboarding');
  }, [router]);

  const resetPilotPreview = useCallback(async () => {
    if (!campaignId || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.removeItem(`@tryggd_pilot_plus_preview_dismissed_${campaignId}`);
    await supabase.from('profiles').update({ pilot_preview_activated_at: null }).eq('id', user.id);
    setPilotDialogDismissed(false);
    await refreshProfile();
  }, [campaignId, user, refreshProfile]);

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
      setMoodScore(isFromToday ? data.wellness_score ?? WELLNESS_DEFAULT : WELLNESS_DEFAULT);
      setSubmittedMoodScore(isFromToday ? data.wellness_score ?? WELLNESS_DEFAULT : WELLNESS_DEFAULT);

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
          setMoodScore(todayCheckin.wellness_score);
          setSubmittedMoodScore(todayCheckin.wellness_score);
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
        setMoodScore(WELLNESS_DEFAULT);
        setSubmittedMoodScore(WELLNESS_DEFAULT);
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
        setNow(new Date());
        checkDateAndReset();
        fetchLastCheckin();
        refetchStreak();
        fetchContactsCount();
        void fetchLatestStatusNotificationRef.current();
        void refreshCheckins();
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

  const enrichHomeStatusNotification = useCallback(async (notification: any): Promise<HomeStatusNotification> => {
    const parsedData = parseNotificationData(notification.data);
    let senderName =
      parsedData.contactDisplayName ||
      parsedData.senderName ||
      notification.title ||
      'Someone';
    let senderAvatarUrl: string | null = null;

    if (notification.sender_user_id) {
      const { data: profileRows } = await supabase.rpc('get_contact_usernames', {
        contact_ids: [notification.sender_user_id],
      });
      const profileData = profileRows?.[0];

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
    } else {
      setLatestStatusNotification(data ? await enrichHomeStatusNotification(data) : null);
    }
  }, [enrichHomeStatusNotification, user]);

  // Keep ref in sync so the AppState handler (declared earlier) always calls the latest version
  useEffect(() => {
    fetchLatestStatusNotificationRef.current = fetchLatestStatusNotification;
  }, [fetchLatestStatusNotification]);

  useEffect(() => {
    void fetchLatestStatusNotification();
  }, [fetchLatestStatusNotification]);

  // Focus effect for tab navigation
  useFocusEffect(
    useCallback(() => {
      console.log('📱 Home screen focused - fetching fresh data');
      fetchLastCheckin();
      fetchContactsCount();
      loadHomeStyle();
      void fetchLatestStatusNotification();
      void refreshCheckins();
    }, [fetchLastCheckin, fetchContactsCount, loadHomeStyle, fetchLatestStatusNotification, refreshCheckins])
  );

  useEffect(() => {
    setLatestStatusAvatarLoadFailed(false);
  }, [latestStatusNotification?.senderAvatarUrl, latestCheckinStatus?.senderAvatarUrl]);

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

  // contact_checkin realtime and foreground-push are handled by ContactCheckinsContext.
  // latestCheckinStatus is now a useMemo derived from the shared context state.

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
              p_wellness_score: canUseWellnessHome ? moodScore : null,
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
            setSubmittedMoodScore(canUseWellnessHome ? moodScore : WELLNESS_DEFAULT);

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

            // Keep trip status and home presence aligned with the active home layout/mode so
            // stale enhanced-mode state does not leak into simple/free experiences or the other mode.
            const nextTripStatus = canUseEnhancedHome && checkinMode === 'trip' ? tripPresence : null;
            const nextHomePresence = canUseEnhancedHome && checkinMode === 'home' ? homePresence : null;
            const nextReachOutStatus = canUseEnhancedHome && checkinMode === 'reach_out' ? reachOutPresence : null;
            supabase
              .from('users_latest_checkin')
              .update({ trip_status: nextTripStatus, home_presence: nextHomePresence, reach_out_status: nextReachOutStatus })
              .eq('user_id', user.id)
              .then(() => {});
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
  }, [canUseEnhancedHome, canUseWellnessHome, capabilities.canShareLocation, user, t, triggerCheckInAnimation, refetchStreak, moodScore, homePresence]);


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

  const greetingInfo = getGreetingInfo(now, t);
  const showLockedPlusWellness = UI_FEATURE_FLAGS.showPlusUpsellUI && !capabilities.isPlus && homeLayout !== 'free';
  const showWellnessModule = canUseWellnessHome || showLockedPlusWellness;
  const displayMoodScore = canUseWellnessHome ? moodScore : WELLNESS_DEFAULT;
  const isReachOutMode = checkinMode === 'reach_out';
  const REACH_OUT_RED = '#EF4444';
  const heartColor = isReachOutMode
    ? REACH_OUT_RED
    : canUseWellnessHome
    ? getWellnessHeartColor(displayMoodScore)
    : BaseColors.primary;
  const activeTripPresenceLabel = checkinMode === 'trip' && tripPresence
    ? t(`home.tripMode.statuses.${tripPresence}` as any) as string
    : null;
  const activeReachOutPresenceLabel = checkinMode === 'reach_out'
    ? t(`home.context.reachOutStatuses.${reachOutPresence}` as any) as string
    : null;
  const activeHomePresenceLabel = t(`home.context.homeStatuses.${homePresence}` as any) as string;
  const selectedPresenceLabel = activeTripPresenceLabel
    ?? activeReachOutPresenceLabel
    ?? (canUseEnhancedHome && checkinMode === 'home' ? activeHomePresenceLabel : null);
  const wellnessMessage = canUseWellnessHome
    ? t(getWellnessMessageKey(displayMoodScore))
    : t('home.everythingIsFine');
  const wellnessEmoji = wellnessMessage.includes('\n') ? wellnessMessage.split('\n')[1] : '';
  const checkedInMessage = selectedPresenceLabel ?? wellnessMessage;
  const checkedInMessageWithBreaks = formatStatusLabelWithBreaks(checkedInMessage);
  const statusLabelEmoji = selectedPresenceLabel?.match(TRIP_STATUS_EMOJI_PATTERN)?.[0] ?? '';
  const checkedInMsgText = stripEmojiFromLabel(checkedInMessageWithBreaks);
  const checkedInMsgEmoji =
    statusLabelEmoji || (checkedInMessage.includes('\n') ? checkedInMessage.split('\n')[1] : wellnessEmoji);
  const shouldShowStatusBadge = !!checkedInMsgEmoji && (checkedInToday || isReachOutMode);
  const chineseFontFamily = getChineseFontFamily(i18n.language);
  const isChineseCheckedInTypography = !!chineseFontFamily;
  const checkedMessageColor =
    checkedInToday && canUseWellnessHome ? BaseColors.surface : BaseColors.surface;
  const simpleDateTimeText = `${formatDateWithTranslation(now, t, i18n.language)} · ${formatTime24h(now, i18n.language)}`;
  const isPlusSimpleHome = homeLayout === 'plus-simple';
  // Debug-only: hidden in production because __DEV__ is false in release builds
  const showDebugResetCheckin = __DEV__;
  const currentFontScale = windowDimensions.fontScale || fontScale;
  const currentScreenWidth = windowDimensions.width || SCREEN_WIDTH;
  const currentScreenHeight = windowDimensions.height || SCREEN_HEIGHT;
  const overflowAmount = viewportHeight > 0
    ? Math.max(0, contentHeight - viewportHeight - SCROLL_OVERFLOW_TOLERANCE)
    : 0;
  // viewportHeight = actual usable scroll area (excludes status bar, tab bar, nav bar)
  // screenHeight = full window height. viewportHeight is ~120-150px smaller on most devices.
  // Use viewportHeight when available for accurate compactness; thresholds adjusted accordingly.
  const effectiveHeight = viewportHeight > 0 ? viewportHeight : currentScreenHeight - 150;
  const simpleHomeCompactness: NonNullable<WellnessButtonPickerProps['compactness']> =
    effectiveHeight < 560 || currentFontScale >= 1.2 || overflowAmount > 72
      ? 'tight'
      : effectiveHeight < 640 || currentFontScale >= 1.1 || overflowAmount > 0
        ? 'compact'
        : 'regular';
  const isCompactSimpleHome = simpleHomeCompactness !== 'regular';
  const isTightSimpleHome = simpleHomeCompactness === 'tight';
  const fitTightenOffset = overflowAmount > 72 ? 22 : overflowAmount > 0 ? 10 : 0;
  const uncheckedCircleBoost = !checkedInToday && overflowAmount === 0
    ? (isTightSimpleHome ? 12 : isCompactSimpleHome ? 14 : 16)
    : 0;
  const circleSize = Math.min(
    currentScreenWidth * (isTightSimpleHome ? 0.56 : isCompactSimpleHome ? 0.62 : 0.68),
    (isTightSimpleHome ? 208 : isCompactSimpleHome ? 224 : 250) + uncheckedCircleBoost,
  ) - fitTightenOffset + uncheckedCircleBoost;
  const strokeWidth = Math.max(28, (isTightSimpleHome ? 32 : isCompactSimpleHome ? 36 : STROKE_WIDTH) - (overflowAmount > 72 ? 4 : overflowAmount > 0 ? 2 : 0));
  const maxStroke = strokeWidth + 3;
  const circleRadius = (circleSize - maxStroke) / 2;
  const innerButtonSize = circleSize - strokeWidth;
  const innerButtonOffset = strokeWidth / 2;
  const checkedInTextLength = checkedInMsgText.replace(/\n/g, '').trim().length;
  const hasCheckedInForcedBreak = checkedInMsgText.includes('\n');
  const [checkedInLineOneRaw = '', checkedInLineTwoRaw = ''] = hasCheckedInForcedBreak
    ? checkedInMsgText.split('\n')
    : [checkedInMsgText, ''];
  const checkedInLineOne = checkedInLineOneRaw.trim();
  const checkedInLineTwo = checkedInLineTwoRaw.trim();
  const checkedInLongestLineUnits = Math.max(
    getVisualTextUnits(checkedInLineOne),
    getVisualTextUnits(checkedInLineTwo),
    getVisualTextUnits(checkedInMsgText),
  );
  const isLongCheckedInText = hasCheckedInForcedBreak || checkedInTextLength > 12;
  const checkedInForcedBreakScale =
    checkedInLongestLineUnits > 16
      ? 0.094
      : checkedInLongestLineUnits > 14
        ? 0.1
        : checkedInLongestLineUnits > 12
          ? 0.108
          : checkedInLongestLineUnits > 10
            ? 0.116
            : 0.124;
  const checkedInMaxFontSize = isChineseCheckedInTypography ? 26 : 26;
  const checkedInFontSize = clampNumber(
    Math.round(innerButtonSize * (hasCheckedInForcedBreak ? checkedInForcedBreakScale : isLongCheckedInText ? 0.138 : 0.164)),
    14,
    checkedInMaxFontSize,
  );
  const checkedInLineHeight = Math.round(checkedInFontSize * (isChineseCheckedInTypography ? 1.22 : 1.1));
  const checkedInTextBoxHeight = checkedInLineHeight * 2 + (isChineseCheckedInTypography ? 6 : 0);
  const checkedInEmojiSize = clampNumber(
    Math.round(checkedInFontSize + (isLongCheckedInText ? 2 : 6)),
    18,
    36,
  );
  const checkedInEmojiLineHeight = Math.round(checkedInEmojiSize * 1.15);
  const checkedHeartSize = clampNumber(
    ICON_SIZES.SUPER_HUGE - (isLongCheckedInText ? 16 : 0),
    34,
    ICON_SIZES.SUPER_HUGE,
  );
  const checkedHeartOutlineSize = checkedHeartSize + (capabilities.canUseWellnessSlider ? 8 : 0);
  const uncheckedCtaFontSize = clampNumber(Math.round(innerButtonSize * 0.108), 13, 18);
  const uncheckedCtaLineHeight = Math.round(uncheckedCtaFontSize * 1.16);
  const uncheckedCountdownFontSize = clampNumber(Math.round(innerButtonSize * 0.122), 15, 22);
  const uncheckedCountdownLineHeight = Math.round(uncheckedCountdownFontSize * 1.12);
  const uncheckedMetaFontSize = clampNumber(Math.round(innerButtonSize * 0.086), 11, 16);
  const uncheckedMetaLineHeight = Math.round(uncheckedMetaFontSize * 1.16);
  const shouldScroll = contentHeight > viewportHeight + SCROLL_OVERFLOW_TOLERANCE;
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
    : isReachOutMode ? null : t('home.dontForget');
  const simpleCheckinLabel = checkedInToday && lastCheckinUtc
    ? isReachOutMode
      ? t('home.reachOut.lastSentLabel' as any) as string
      : t('home.status.lastCheckinLabel' as any) as string
    : null;
  const simpleCheckinTimeAgo = checkedInToday && lastCheckinUtc
    ? formatHomeStatusAgo(lastCheckinUtc)
    : null;
  const latestDisplayStatus: HomeStatusNotification | null =
    !latestCheckinStatus && !latestStatusNotification ? null
    : !latestCheckinStatus ? latestStatusNotification
    : !latestStatusNotification ? latestCheckinStatus
    : new Date(latestCheckinStatus.created_at) >= new Date(latestStatusNotification.created_at)
      ? latestCheckinStatus
      : latestStatusNotification;

  const latestStatusIsEmergency = latestDisplayStatus?.type === 'emergency_message';
  const latestStatusTitle = latestDisplayStatus
    ? latestDisplayStatus.type === 'contact_checkin'
      ? t('home.status.contactCheckedIn', { name: latestDisplayStatus.senderName })
      : latestStatusIsEmergency
        ? t('home.status.emergencyMessage', {
            name: latestDisplayStatus.senderName,
            message: latestDisplayStatus.data?.message || latestDisplayStatus.body || '',
          })
        : latestDisplayStatus.type === 'checkin_response'
          ? t('home.status.respondedToYou', { name: latestDisplayStatus.senderName })
          : t('home.status.sentWave', { name: latestDisplayStatus.senderName })
    : null;
  const _latestTripStatus = latestDisplayStatus?.data?.tripStatus ?? null;
  const _latestHomePresence = !_latestTripStatus && capabilities.isPlus ? latestDisplayStatus?.data?.homePresence ?? null : null;
  const _latestReachOut = !_latestTripStatus && capabilities.isPlus ? latestDisplayStatus?.data?.reachOutStatus ?? null : null;

  const latestPresenceLabel: string | null = _latestTripStatus
    ? (t(`home.tripMode.statuses.${_latestTripStatus}` as any) as string)
    : _latestHomePresence
      ? (t(`home.context.homeStatuses.${_latestHomePresence}` as any) as string)
      : _latestReachOut
        ? (t(`home.context.reachOutStatuses.${_latestReachOut}` as any) as string)
        : null;
  const latestPresenceEmoji = latestPresenceLabel?.match(TRIP_STATUS_EMOJI_PATTERN)?.[0] ?? null;
  const latestPresenceBadgeText = latestPresenceLabel?.replace(TRIP_STATUS_EMOJI_PATTERN, '').trim() ?? null;
  // Fall back to notification location when latestCheckinStatus wins but its contactLocationMap key didn't match
  const latestLocationData =
    latestDisplayStatus?.data?.location ??
    (latestStatusNotification?.sender_user_id === latestDisplayStatus?.sender_user_id
      ? latestStatusNotification?.data?.location ?? null
      : null);
  const latestHasLocation = capabilities.isPlus && !!latestLocationData;
  const toggleLatestStatusBadgeTooltip = () => {
    if (presenceBadgeTooltipTimerRef.current) clearTimeout(presenceBadgeTooltipTimerRef.current);
    setLatestStatusBadgeTooltipVisible((visible) => {
      if (!visible) {
        presenceBadgeTooltipTimerRef.current = setTimeout(() => setLatestStatusBadgeTooltipVisible(false), 3000);
      }
      return !visible;
    });
  };
  const toggleLatestStatusWellnessTooltip = () => {
    if (moodTooltipTimerRef.current) clearTimeout(moodTooltipTimerRef.current);
    setLatestStatusWellnessTooltipVisible((visible) => {
      if (!visible) {
        moodTooltipTimerRef.current = setTimeout(() => setLatestStatusWellnessTooltipVisible(false), 3000);
      }
      return !visible;
    });
  };
  const openLatestStatusLocation = async () => {
    const location = latestLocationData;
    if (!location) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Error opening shared location:', error);
      Alert.alert(t('errors.title'), t('activity.errors.openSharedLocation'));
    }
  };
  const latestMoodScore = capabilities.isPlus && !_latestReachOut
    ? latestDisplayStatus?.data?.wellnessScore
    : undefined;
  const latestMoodMeta = getWellnessStatusMeta(latestMoodScore);
  const latestStatusAvatarUrl =
    latestDisplayStatus?.senderAvatarUrl?.trim() &&
    !isLocalAvatarUri(latestDisplayStatus.senderAvatarUrl) &&
    !latestStatusAvatarLoadFailed
      ? latestDisplayStatus.senderAvatarUrl.trim()
      : '';
  const getWellnessTooltipLabel = (score: number) => {
    const message = t(getWellnessMessageKey(score));
    return message.includes('\n') ? message.split('\n')[0] : message;
  };
  const showPilotDialog =
    isPlusPreviewOpen &&
    !hasActivatedPilotPreview &&
    !hasPaidPlusAccess &&
    !pilotDialogDismissed &&
    !loading;

  return (
    <SafeAreaView style={[styles.mainContainer, styles.simpleMainContainer]} edges={['top']}>
      {/* HEADER - OUTSIDE SCROLLVIEW (FIXED) */}
      <ScreenHeader
        title={profile?.display_name || t('home.welcome')}
        subtitle={greetingInfo.greeting}
        iconName={greetingInfo.iconName as any}
        style={styles.simpleHeader}
        showGreetingInLine={true}
        rightElement={
          <View style={styles.headerActions}>
            {showDebugResetCheckin ? (
              <>
                <TouchableOpacity
                  onPress={resetOnboardingFlow}
                  style={styles.headerDebugButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="sparkles" size={ICON_SIZES.SM} color="#E85D75" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={resetAllState}
                  style={styles.headerDebugButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={ICON_SIZES.SM} color={BaseColors.error} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={resetPilotPreview}
                  style={styles.headerDebugButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="diamond-outline" size={ICON_SIZES.SM} color={BaseColors.primary} />
                </TouchableOpacity>
              </>
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
      <Text style={[
        styles.simpleHeaderDate,
        isCompactSimpleHome && styles.simpleHeaderDateCompact,
        overflowAmount > 72 && styles.simpleHeaderDateUltra,
      ]}>
        {simpleDateTimeText}
      </Text>

      {/* Plus Preview banner — shown after dialog is dismissed */}
      {isPlusPreviewOpen && !hasActivatedPilotPreview && !hasPaidPlusAccess && pilotDialogDismissed && !loading ? (
        <TouchableOpacity
          style={styles.pilotBanner}
          onPress={() => setPilotDialogDismissed(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.pilotBannerText}>{t('pilotPreview.dialogTitle' as any) as string}</Text>
          <Ionicons name="chevron-forward" size={14} color={BaseColors.primaryDark} />
        </TouchableOpacity>
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
        <Animated.View style={[{ opacity: fadeAnim }, styles.simpleAnimatedContent]}>
          {canUseEnhancedHome ? (
            <View style={[
              styles.modeTabsContainer,
              styles.groupContainer,
              overflowAmount > 72 && styles.modeTabsContainerUltra,
            ]}>
              <View style={styles.modeTabsRow}>
                <TouchableOpacity
                  style={[styles.modeTab, checkinMode === 'home' && styles.modeTabActive]}
                  onPress={() => handleCheckinModeChange('home')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeTabText, checkinMode === 'home' && styles.modeTabTextActive]}>
                    {t('home.context.homeTab')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, checkinMode === 'trip' && styles.modeTabActive]}
                  onPress={() => handleCheckinModeChange('trip')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeTabText, checkinMode === 'trip' && styles.modeTabTextActive]}>
                    {t('home.context.tripTab')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeTab, checkinMode === 'reach_out' && styles.modeTabActiveReachOut]}
                  onPress={() => handleCheckinModeChange('reach_out')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modeTabText, checkinMode === 'reach_out' && styles.modeTabTextActiveReachOut]}>
                    {t('home.context.reachOutTab')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* MAIN CHECK-IN */}
          <View style={[
            styles.checkInGroup,
            styles.groupContainer,
            styles.simpleCheckInGroup,
            canUseEnhancedHome && styles.enhancedCheckInGroup,
            isCompactSimpleHome && styles.simpleCheckInGroupCompact,
            isTightSimpleHome && styles.simpleCheckInGroupTight,
            overflowAmount > 72 && styles.simpleCheckInGroupUltra,
            isReachOutMode && styles.reachOutCheckInGroup,
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
                    <View style={[
                      styles.iconContainer,
                      !checkedInToday && styles.iconContainerUnchecked,
                      checkedInToday && isLongCheckedInText && styles.iconContainerCompactCheckedIn,
                    ]}>
                      {checkedInToday ? (
                        <View style={styles.checkedHeartStack}>
                          {capabilities.canUseWellnessSlider && (
                            <Ionicons
                              name="heart-sharp"
                              size={checkedHeartOutlineSize}
                              color="#fff"
                              style={styles.checkedHeartOutline}
                            />
                          )}
                          <Ionicons
                            name="heart-sharp"
                            size={checkedHeartSize}
                            color={capabilities.canUseWellnessSlider ? heartColor : '#fff'}
                          />
                        </View>
                      ) : (
                        <Ionicons name="heart" size={ICON_SIZES.SUPER_HUGE} color={heartColor} />
                      )}
                    </View>

                    {/* Text Content */}
                    <View style={[
                      styles.textContainer,
                      !checkedInToday && styles.textContainerUnchecked,
                      !checkedInToday && capabilities.isPlus && styles.textContainerUncheckedPlus,
                      checkedInToday && isLongCheckedInText && styles.textContainerCompactCheckedIn,
                      checkedInToday && capabilities.isPlus && { flex: 1 },
                    ]}>
                      {checkedInToday ? (
                        hasCheckedInForcedBreak ? (
                          <View style={[
                            styles.checkedInTextBox,
                            isChineseCheckedInTypography && styles.checkedInTextBoxChinese,
                            { minHeight: checkedInTextBoxHeight },
                          ]}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.checkedInText,
                                styles.checkedInTextLine,
                                isChineseCheckedInTypography && styles.checkedInTextChinese,
                                {
                                  fontSize: checkedInFontSize,
                                  lineHeight: checkedInLineHeight,
                                },
                                { color: checkedMessageColor },
                                chineseFontFamily ? { fontFamily: chineseFontFamily } : null,
                              ]}
                            >
                              {checkedInLineOne}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.checkedInText,
                                styles.checkedInTextLine,
                                isChineseCheckedInTypography && styles.checkedInTextChinese,
                                {
                                  fontSize: checkedInFontSize,
                                  lineHeight: checkedInLineHeight,
                                },
                                { color: checkedMessageColor },
                                chineseFontFamily ? { fontFamily: chineseFontFamily } : null,
                              ]}
                            >
                              {checkedInLineTwo}
                            </Text>
                          </View>
                        ) : (
                          <Text
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.52}
                            style={[
                              styles.checkedInText,
                              isChineseCheckedInTypography && styles.checkedInTextChinese,
                              {
                                fontSize: checkedInFontSize,
                                lineHeight: checkedInLineHeight,
                                minHeight: checkedInTextBoxHeight,
                              },
                              { color: checkedMessageColor },
                              chineseFontFamily ? { fontFamily: chineseFontFamily } : null,
                            ]}
                          >
                            {checkedInMsgText}
                          </Text>
                        )
                      ) : (
                        <>
                          <View style={styles.uncheckedCtaGroup}>
                            <Text
                              style={[
                                styles.ctaText,
                                {
                                  fontSize: uncheckedCtaFontSize,
                                  lineHeight: uncheckedCtaLineHeight,
                                },
                                fontScale > 1.2 && styles.compactCtaText,
                              ]}
                              numberOfLines={2}
                            >
                              {isReachOutMode ? t('home.reachOut.pressToSendHelp' as any) : t('home.pressMeToCheckIn')}
                            </Text>
                          </View>
                          {!isReachOutMode && (
                            <View style={styles.uncheckedMetaGroup}>
                              <Text
                                style={[
                                  styles.timeLeftText,
                                  {
                                    fontSize: uncheckedMetaFontSize,
                                    lineHeight: uncheckedMetaLineHeight,
                                  },
                                  fontScale > 1.2 && styles.compactTimeLeftText,
                                ]}
                                numberOfLines={1}
                              >
                                {t('home.timeLeftToday')}
                              </Text>
                              <Text
                                style={[
                                  styles.countdownText,
                                  {
                                    fontSize: uncheckedCountdownFontSize,
                                    lineHeight: uncheckedCountdownLineHeight,
                                  },
                                  fontScale > 1.2 && styles.compactCountdownText,
                                ]}
                                numberOfLines={1}
                              >
                                {formatTimeLeft(remainingMs)}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                    {shouldShowStatusBadge && (
                      <Text style={[
                        styles.checkedInEmoji,
                        {
                          fontSize: checkedInEmojiSize,
                          lineHeight: checkedInEmojiLineHeight,
                        },
                      ]}>{checkedInMsgEmoji}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
            {(simpleCheckinLabel || simpleCheckinSummary) ? (
              <View style={[
                styles.simpleCheckinInfoRow,
                isCompactSimpleHome && styles.simpleCheckinInfoRowCompact,
                overflowAmount > 72 && styles.simpleCheckinInfoRowUltra,
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

          {isPlusSimpleHome && !isReachOutMode ? (
            <WellnessButtonPicker
              value={moodScore}
              onChange={setMoodScore}
              title={t('home.wellnessPrompt')}
              options={SIMPLE_WELLNESS_OPTIONS}
              tooltipLabels={{
                [-1]: getWellnessTooltipLabel(-1),
                [0]: getWellnessTooltipLabel(0),
                [1]: getWellnessTooltipLabel(1),
              }}
              compactness={simpleHomeCompactness}
            />
          ) : null}

          {canUseEnhancedHome && showWellnessModule && !isReachOutMode ? (
            <View style={[styles.enhancedWellnessGroup, styles.groupContainer]}>
              <WellnessSlider
                value={moodScore}
                onChange={setMoodScore}
                tooltipText={getWellnessTooltipLabel(moodScore)}
              />
            </View>
          ) : null}

          {canUseEnhancedHome && (
            <View style={[styles.enhancedStatusCard, styles.groupContainer, styles.enhancedStatusCardTightGap]}>
              {checkinMode === 'home' ? (
                <View style={styles.tripStatusGroupEnhanced}>
                  <RNScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tripPillsRowEnhanced}
                    scrollEnabled
                  >
                    {HOME_PRESENCE_OPTIONS.map((option) => {
                      const isActive = homePresence === option;

                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.tripPill, isActive && styles.tripPillActive]}
                          onPress={() => handleHomePresenceChange(option)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.tripPillText, isActive && styles.tripPillTextActive]}>
                            {t(`home.context.homeStatuses.${option}` as any) as string}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </RNScrollView>
                  <View style={styles.tripScrollHint}>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={BaseColors.primary}
                    />
                  </View>
                </View>
              ) : checkinMode === 'trip' ? (
                <View style={styles.tripStatusGroupEnhanced}>
                  <RNScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tripPillsRowEnhanced}
                    scrollEnabled
                  >
                    {TRIP_STATUS_KEYS.map((key) => {
                      const isActive = tripPresence === key;

                      return (
                        <TouchableOpacity
                          key={key}
                          style={[styles.tripPill, isActive && styles.tripPillActive]}
                          onPress={() => setTripPresence(isActive ? null : key)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.tripPillText, isActive && styles.tripPillTextActive]}>
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
                      color={BaseColors.primary}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.tripStatusGroupEnhanced}>
                  <RNScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tripPillsRowEnhanced}
                    scrollEnabled
                  >
                    {REACH_OUT_STATUS_OPTIONS.map((option) => {
                      const isActive = reachOutPresence === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.tripPill, isActive && styles.tripPillActive]}
                          onPress={() => handleReachOutPresenceChange(option)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.tripPillText, isActive && styles.tripPillTextActive]}>
                            {t(`home.context.reachOutStatuses.${option}` as any) as string}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </RNScrollView>
                </View>
              )}
            </View>
          )}

          <View style={[
            styles.simpleStatusDock,
            canUseEnhancedHome && styles.simpleStatusDockEnhanced,
            isCompactSimpleHome && styles.simpleStatusDockCompact,
            overflowAmount > 72 && styles.simpleStatusDockUltra,
          ]}>
            <View style={[
              styles.simpleStatusGroup,
              isCompactSimpleHome && styles.simpleStatusGroupCompact,
              overflowAmount > 72 && styles.simpleStatusGroupUltra,
            ]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/(tabs)/activity')}
                style={[
                  styles.simpleStatusCard,
                  isCompactSimpleHome && styles.simpleStatusCardCompact,
                  isTightSimpleHome && styles.simpleStatusCardTight,
                  overflowAmount > 72 && styles.simpleStatusCardUltra,
                ]}
              >
                  {latestDisplayStatus ? (
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
                          name={latestStatusIsEmergency ? 'warning' : 'person-circle'}
                          size={isCompactSimpleHome ? 50 : 56}
                          color={latestStatusIsEmergency ? BaseColors.error : BaseColors.neutral[300]}
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
                          latestStatusIsEmergency && { color: BaseColors.error },
                        ]} numberOfLines={1}>
                          {latestStatusTitle}
                        </Text>
                        <Text style={[
                          styles.simpleStatusSubtitle,
                          isCompactSimpleHome && styles.simpleStatusSubtitleCompact,
                        ]} numberOfLines={1}>
                          {formatHomeStatusAgo(latestDisplayStatus.created_at)}
                        </Text>
                      </View>
                      <View style={styles.simpleStatusEmojiGroup}>
                        {latestHasLocation ? (
                          <TouchableOpacity
                            onPress={openLatestStatusLocation}
                            activeOpacity={0.7}
                            style={[
                              styles.simpleStatusEmojiCircle,
                              isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                              styles.simpleStatusTripEmojiCircle,
                            ]}
                          >
                            <Ionicons
                              name="location"
                              size={isCompactSimpleHome ? 19 : 23}
                              color={BaseColors.primaryDark}
                            />
                          </TouchableOpacity>
                        ) : null}
                        {latestPresenceEmoji ? (
                          <View style={styles.simpleStatusBadgeWrapper}>
                            {presenceBadgeTooltipVisible && (
                              <View style={[
                                styles.simpleStatusTooltip,
                                { borderColor: BaseColors.primaryBorder, backgroundColor: BaseColors.primaryLight },
                              ]}>
                                <Text style={[styles.simpleStatusTooltipText, { color: BaseColors.primary }]}>
                                  {latestPresenceBadgeText}
                                </Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={toggleLatestStatusBadgeTooltip}
                              activeOpacity={0.7}
                              style={[
                                styles.simpleStatusEmojiCircle,
                                isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                                styles.simpleStatusTripEmojiCircle,
                              ]}
                            >
                              <Text style={[
                                styles.simpleStatusEmoji,
                                isCompactSimpleHome && styles.simpleStatusEmojiCompact,
                              ]}>{latestPresenceEmoji}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                        {_latestReachOut ? (
                          <View style={styles.simpleStatusBadgeWrapper}>
                            {moodTooltipVisible && (
                              <View style={[
                                styles.simpleStatusTooltip,
                                { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
                              ]}>
                                <Text style={[styles.simpleStatusTooltipText, { color: '#EF4444' }]}>
                                  {(() => {
                                    const label = t('home.context.reachOutTab') as string;
                                    const m = label.match(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]+️?/u);
                                    return m ? label.slice(m[0].length).trim() : label;
                                  })()}
                                </Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={toggleLatestStatusWellnessTooltip}
                              activeOpacity={0.7}
                              style={[
                                styles.simpleStatusEmojiCircle,
                                isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                                { backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderWidth: 1 },
                              ]}
                            >
                              <Ionicons
                                name="heart"
                                size={isCompactSimpleHome ? 19 : 23}
                                color="#EF4444"
                              />
                            </TouchableOpacity>
                          </View>
                        ) : latestMoodMeta ? (
                          <View style={styles.simpleStatusBadgeWrapper}>
                            {moodTooltipVisible && (
                              <View style={[
                                styles.simpleStatusTooltip,
                                { borderColor: latestMoodMeta.borderColor, backgroundColor: latestMoodMeta.backgroundColor },
                              ]}>
                                <Text style={[styles.simpleStatusTooltipText, { color: latestMoodMeta.color }]}>
                                  {typeof latestMoodScore === 'number' ? getWellnessTooltipLabel(latestMoodScore) : ''}
                                </Text>
                              </View>
                            )}
                            <TouchableOpacity
                              onPress={toggleLatestStatusWellnessTooltip}
                              activeOpacity={0.7}
                              style={[
                                styles.simpleStatusEmojiCircle,
                                isCompactSimpleHome && styles.simpleStatusEmojiCircleCompact,
                                {
                                  backgroundColor: latestMoodMeta.backgroundColor,
                                  borderColor: latestMoodMeta.borderColor,
                                  borderWidth: 1,
                                },
                              ]}
                            >
                              <Ionicons
                                name="heart"
                                size={isCompactSimpleHome ? 19 : 23}
                                color={latestMoodMeta.color}
                              />
                            </TouchableOpacity>
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
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom padding */}
          <View style={styles.bottomPadding} />
        </Animated.View>
      </ScrollView>

      <Modal
        visible={showPilotDialog}
        transparent
        animationType="slide"
        onRequestClose={handleDismissPilotDialog}
      >
        <View style={styles.pilotDialogOverlay}>
          <View style={styles.pilotDialogCard}>
            <Text style={styles.pilotDialogTitle}>{t('pilotPreview.dialogTitle' as any) as string}</Text>
            <Text style={styles.pilotDialogBody}>{t('pilotPreview.dialogBody' as any) as string}</Text>
            <TouchableOpacity
              style={styles.pilotDialogActivateButton}
              onPress={handleActivatePilotPreview}
              activeOpacity={0.85}
            >
              <Text style={styles.pilotDialogActivateText}>{t('pilotPreview.activate' as any) as string}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pilotDialogDismissButton}
              onPress={handleDismissPilotDialog}
              activeOpacity={0.7}
            >
              <Text style={styles.pilotDialogDismissText}>{t('pilotPreview.notNow' as any) as string}</Text>
            </TouchableOpacity>
            <Text style={styles.pilotDialogFooter}>{t('pilotPreview.dialogFooter' as any) as string}</Text>
          </View>
        </View>
      </Modal>
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
    fontSize: iosFontSize(18),
    lineHeight: iosFontSize(23),
    color: BaseColors.neutral[500],
    fontWeight: '700',
  },
  simpleHeaderDateCompact: {
    marginBottom: 4,
    fontSize: iosFontSize(17),
    lineHeight: iosFontSize(21),
  },
  simpleHeaderDateUltra: {
    marginTop: 2,
    marginBottom: 2,
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(19),
  },
  simpleAnimatedContent: {
    flexGrow: 1,
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
  enhancedCheckInGroup: {
    minHeight: 232,
    paddingTop: 2,
    paddingBottom: 6,
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
  simpleCheckInGroupUltra: {
    minHeight: 208,
    paddingTop: 0,
    paddingBottom: 0,
  },
  reachOutCheckInGroup: {
    flex: 0,
    paddingTop: 32,
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
    fontSize: iosFontSize(21),
    lineHeight: iosFontSize(26),
    fontWeight: '800',
    color: BaseColors.text.dark,
    textAlign: 'center',
    marginBottom: 10,
  },
  simpleWellnessTitleCompact: {
    fontSize: iosFontSize(18),
    lineHeight: iosFontSize(23),
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
    fontSize: iosFontSize(17),
    lineHeight: iosFontSize(22),
    fontWeight: '700',
    color: BaseColors.neutral[600],
    textAlign: 'center',
    flexWrap: 'wrap',
    includeFontPadding: false,
  },
  simpleWellnessTooltipTextCompact: {
    fontSize: iosFontSize(13),
    lineHeight: iosFontSize(18),
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
    borderColor: BaseColors.border,
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
  enhancedWellnessGroup: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
  },
  modeTabsContainer: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: 2,
  },
  modeTabsContainerUltra: {
    marginTop: 0,
    marginBottom: -2,
  },
  modeTabsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: '#EEF8F3',
    borderRadius: 18,
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
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
  modeTab: {
    minHeight: 31,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeTabActive: {
    backgroundColor: BaseColors.surface,
    ...Platform.select({
      ios: {
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  modeTabText: {
    fontSize: iosFontSize(13),
    lineHeight: iosFontSize(17),
    fontWeight: '700',
    color: BaseColors.neutral[500],
    includeFontPadding: false,
  },
  modeTabTextActive: {
    color: BaseColors.primary,
  },
  modeTabActiveReachOut: {
    backgroundColor: '#FEE2E2',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  modeTabTextActiveReachOut: {
    color: '#EF4444',
  },
  enhancedStatusCard: {
    marginHorizontal: SCREEN_PADDING.horizontal,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EEF8F3',
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    minHeight: 48,
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
  enhancedStatusCardTightGap: {
    marginBottom: 4,
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
    overflow: 'visible',
  },
  wellnessTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: BaseColors.primaryBorder,
  },
  wellnessSliderTooltip: {
    position: 'absolute',
    bottom: 38,
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: BaseColors.surface,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    alignItems: 'center',
    zIndex: 2,
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
  wellnessSliderTooltipText: {
    width: '100%',
    fontSize: iosFontSize(12),
    lineHeight: iosFontSize(17),
    fontWeight: '700',
    color: BaseColors.neutral[600],
    textAlign: 'center',
    includeFontPadding: false,
  },
  wellnessSliderTooltipArrow: {
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
  tripStatusGroupEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripScrollHint: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripPillsRowEnhanced: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
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
  checkInButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  checkedInText: {
    color: BaseColors.surface,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  checkedInTextBox: {
    width: '100%',
    justifyContent: 'center',
  },
  checkedInTextBoxChinese: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  checkedInTextLine: {
    minHeight: 0,
  },
  checkedInTextChinese: {
    paddingTop: 1,
    paddingBottom: 1,
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
  iconContainerUnchecked: {
    marginTop: 18,
    marginBottom: 8,
  },
  iconContainerCompactCheckedIn: {
    minHeight: 44,
    marginTop: 4,
    marginBottom: 2,
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
  textContainerUnchecked: {
    marginTop: 6,
    paddingHorizontal: 18,
  },
  textContainerUncheckedPlus: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 14,
    marginTop: 0,
  },
  uncheckedCtaGroup: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  uncheckedMetaGroup: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  textContainerCompactCheckedIn: {
    paddingHorizontal: 18,
  },
  ctaText: {
    color: BaseColors.text.dark,
    fontSize: iosFontSize(17),
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 0,
  },
  countdownText: {
    color: BaseColors.primary,
    fontSize: iosFontSize(20),
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  timeLeftText: {
    color: BaseColors.text.light,
    fontSize: iosFontSize(16),
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 0,
  },
  compactCtaText: {
    fontSize: iosFontSize(14),
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  compactCountdownText: {
    fontSize: iosFontSize(14),
    marginTop: 2,
  },
  compactTimeLeftText: {
    fontSize: iosFontSize(11),
    marginTop: 0,
  },
  simpleStatusDock: {
    marginTop: 'auto',
    paddingTop: 12,
    paddingBottom: 2,
    backgroundColor: 'rgba(238, 248, 243, 0.24)',
  },
  simpleStatusDockEnhanced: {
    paddingTop: 6,
  },
  simpleStatusDockCompact: {
    paddingTop: 9,
  },
  simpleStatusDockUltra: {
    paddingTop: 4,
    paddingBottom: 0,
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
  simpleStatusGroupUltra: {
    marginBottom: 4,
  },
  simpleCheckinInfoRow: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  simpleCheckinInfoRowCompact: {
    marginTop: 6,
  },
  simpleCheckinInfoRowUltra: {
    marginTop: 2,
  },
  simpleCheckinInfoIcon: {
    flexShrink: 0,
  },
  simpleCheckinInfoText: {
    fontSize: iosFontSize(18),
    lineHeight: iosFontSize(22),
    fontWeight: '600',
    textAlign: 'center',
  },
  simpleCheckinInfoTextCompact: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(20),
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
  simpleStatusCardUltra: {
    minHeight: 58,
    paddingVertical: 6,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: BaseColors.neutral[100],
    borderWidth: 2,
    borderColor: BaseColors.primaryLight,
  },
  simpleStatusAvatarCompact: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    fontSize: iosFontSize(19),
    lineHeight: iosFontSize(23),
    fontWeight: '800',
    color: BaseColors.primaryDark,
  },
  simpleStatusTitleCompact: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(20),
  },
  simpleStatusSubtitle: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(20),
    color: BaseColors.neutral[500],
    marginTop: 2,
    fontWeight: '600',
  },
  simpleStatusSubtitleCompact: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(18),
    marginTop: 1,
  },
  simpleStatusEmojiGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginLeft: 8,
    minWidth: 32,
  },
  simpleStatusEmojiCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleStatusEmojiCircleCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  simpleStatusTripEmojiCircle: {
    backgroundColor: BaseColors.primaryLight,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
  },
  simpleStatusEmoji: {
    fontSize: iosFontSize(23),
    lineHeight: iosFontSize(27),
  },
  simpleStatusEmojiCompact: {
    fontSize: iosFontSize(19),
    lineHeight: iosFontSize(23),
  },
  simpleStatusBadgeWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  simpleStatusTooltip: {
    position: 'absolute',
    bottom: 54,
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
  simpleStatusTooltipText: {
    fontSize: iosFontSize(15),
    fontWeight: '600',
    textAlign: 'center',
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
  cardSubtext: {
    fontSize: iosFontSize(16),
    fontWeight: '600',
    marginTop: 4,
    color: BaseColors.primary,
    textAlign: 'center',
    lineHeight: iosFontSize(18),
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
  tripIconContainer: {
    backgroundColor: 'rgba(255,255,255,0.25)',
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
  },
  pilotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B8DDD2',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BaseColors.primary,
    paddingVertical: 8,
    paddingHorizontal: SCREEN_PADDING.horizontal,
    gap: 6,
  },
  pilotBannerText: {
    fontSize: iosFontSize(13),
    fontWeight: '600',
    color: BaseColors.primaryDark,
  },
  pilotDialogOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pilotDialogCard: {
    backgroundColor: BaseColors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  pilotDialogTitle: {
    fontSize: iosFontSize(22),
    fontWeight: '800',
    color: BaseColors.text.dark,
    textAlign: 'center',
    marginBottom: 14,
  },
  pilotDialogBody: {
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(22),
    color: BaseColors.text.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  pilotDialogActivateButton: {
    backgroundColor: BaseColors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  pilotDialogActivateText: {
    fontSize: iosFontSize(16),
    fontWeight: '700',
    color: BaseColors.surface,
  },
  pilotDialogDismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  pilotDialogDismissText: {
    fontSize: iosFontSize(15),
    fontWeight: '500',
    color: BaseColors.text.muted,
  },
  pilotDialogFooter: {
    fontSize: iosFontSize(12),
    color: BaseColors.text.light,
    textAlign: 'center',
    marginTop: 4,
  },
});
