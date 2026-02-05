// app/(tabs)/index.tsx
import colors from "@/constants/colors";
import { useStreak } from "@/hooks/useStreak";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Localization from 'expo-localization';
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  AppState,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Circle, Defs, Stop, Svg, LinearGradient as SvgGradient } from "react-native-svg";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get('window');


const CIRCLE_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);
const STROKE_WIDTH = 14;
const CIRCLE_RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCLE_GAP = 8;

const STORAGE_KEY = "@checkin_state";
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const IS_IOS = Platform.OS === 'ios';
const BOTTOM_BUTTON_MARGIN = IS_IOS ? 20 : 16;

// Helper function to get both greeting and icon name
const getGreetingInfo = (date: Date, t: any): { greeting: string; iconName: string } => {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return {
    greeting: t("home.greetings.morning"),
    iconName: "sunny"
  };

  if (hour >= 12 && hour < 18) return {
    greeting: t("home.greetings.afternoon"),
    iconName: "partly-sunny"
  };

  if (hour >= 18 && hour < 22) return {
    greeting: t("home.greetings.evening"),
    iconName: "moon"
  };

  return {
    greeting: t("home.greetings.night"),
    iconName: "moon"
  };
};

const formatTimeLeft = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const isNearMidnight = (date: Date): boolean => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return (hours === 0 && minutes === 0) || (hours === 23 && minutes === 59);
};

// Manual date formatting using translations
// Fixed date formatting function with safer language checking
// Fixed date formatting function with safer language checking
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
  const englishWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const englishMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
    'en': 'en-US',
    'sv': 'sv-SE',
    'no': 'nb-NO',
    'da': 'da-DK',
    'fi': 'fi-FI',
    'zh-Hans': 'zh_Hans',
    'zh-Hant': 'zh-Hant',
    'zh': 'zh-CN',
  };

  const locale = localeMap[language] || 'en-US';

  try {
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (error) {
    return date.toLocaleTimeString('en-US', {
      hour: "2-digit",
      minute: "2-digit",
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
  const { streak, loading: streakLoading } = useStreak();
  const [showResetButton, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

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

  const checkAndResetIfPastMidnight = useCallback(() => {
    if (isNearMidnight(new Date())) {
      resetAllState();
    }
  }, [resetAllState]);

  const fetchLastCheckin = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("users_latest_checkin")
      .select("last_checked_in_utc")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(t("home.errors.fetchLastCheckin"), error);
      return;
    }

    if (data?.last_checked_in_utc) {
      setLastCheckinUtc(data.last_checked_in_utc);
      setCheckedInToday(true);
      setShowResetButton(true);
    }
  }, [user, t]);

  const handleCheckIn = useCallback(async () => {
    try {
      if (!user) throw new Error(t("home.errors.noUser"));

      triggerCheckInAnimation();

      const tz = (Localization as any).timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      console.log("Device timezone:", tz);

      const { data, error } = await supabase
        .from("checkins")
        .insert({
          user_id: user.id,
          checkin_timezone: tz,
        })
        .select("id, checked_in_at_utc")
        .single();

      if (error) throw error;
      if (!data) return;

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

    } catch (err) {
      console.error(t("home.errors.checkin"), err);
    }
  }, [user, t]);

  // Lifecycle effects
  useEffect(() => {
    if (!loading && user) {
      fetchLastCheckin();
    }
  }, [loading, user, fetchLastCheckin]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/(auth)/login");
    }
  }, [loading, user]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
      checkAndResetIfPastMidnight();
    }, 1000);

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        checkAndResetIfPastMidnight();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkAndResetIfPastMidnight]);

  useEffect(() => {
    const loadState = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved);
        setCheckedInToday(parsed.checkedInToday ?? false);
        setShowResetButton(parsed.checkedInToday ?? false);
        setLastCheckinUtc(parsed.lastCheckinUtc ?? null);
      } catch (err) {
        console.error(t("home.errors.loadState"), err);
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadState();
  }, [t]);

  // Calculations
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const elapsedMs = now.getTime() - startOfDay.getTime();
  const progress = Math.min(elapsedMs / MS_IN_DAY, 1);
  const remainingMs = Math.max(0, MS_IN_DAY - elapsedMs);

  if (loading || isInitialLoad) {
    return (
      <SafeAreaView style={styles.container}>
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
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[styles.content, { opacity: fadeAnim }]}
      >
        {/* ========== GROUP 1: HEADER ========== */}
        <View style={[styles.headerGroup, styles.groupContainer]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerRow}>
                <Ionicons name={greetingInfo.iconName as any} size={24} color="#5FA893" />
                <Text style={styles.greeting}>{greetingInfo.greeting}</Text>
              </View>
              <Text style={styles.displayName} numberOfLines={1}>
                {profile?.display_name || t("home.welcome")}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => router.push("/(tabs)/profile")}
              style={styles.profileButton}
              activeOpacity={0.7}
            >
              <Ionicons name="person" size={24} color="#5FA893" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ========== GROUP 2: DATE & TIME ========== */}
        <View style={[styles.dateTimeGroup, styles.groupContainer]}>
          <Text style={styles.timeText}>
            {formatTime24h(now, i18n.language)}
          </Text>
          <Text style={styles.dateText}>
            {formatDateWithTranslation(now, t, i18n.language)}
          </Text>
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
                style={[styles.checkInButton, { width: CIRCLE_SIZE, height: CIRCLE_SIZE }]}
              >
                {/* Outer Circle Border */}
                <View
                  style={{
                    position: 'absolute',
                    width: CIRCLE_SIZE + 4,
                    height: CIRCLE_SIZE + 4,
                    borderRadius: (CIRCLE_SIZE + 4) / 2,
                    borderWidth: 2,
                    borderColor: colors.primaryBorder,
                  }}
                />

                {/* Progress Ring */}
                <Svg
                  width={CIRCLE_SIZE}
                  height={CIRCLE_SIZE}
                  style={[styles.svg, { transform: [{ rotate: "-90deg" }] }]}
                >
                  <Defs>
                    <SvgGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <Stop offset="0%" stopColor={colors.primary} />
                      <Stop offset="100%" stopColor="#7DC4B0" />
                    </SvgGradient>
                  </Defs>

                  {/* Background circle */}
                  <Circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={CIRCLE_RADIUS}
                    stroke="#7DC4B0"
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                  />

                  {/* Progress/Complete circle */}
                  {!checkedInToday ? (
                    <Circle
                      cx={CIRCLE_SIZE / 2}
                      cy={CIRCLE_SIZE / 2}
                      r={CIRCLE_RADIUS}
                      stroke="#F3F4F6"
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                      strokeDasharray={2 * Math.PI * CIRCLE_RADIUS}
                      strokeDashoffset={2 * Math.PI * CIRCLE_RADIUS * (1 - progress)}
                      strokeLinecap="butt"
                    />
                  ) : (
                    <Circle
                      cx={CIRCLE_SIZE / 2}
                      cy={CIRCLE_SIZE / 2}
                      r={CIRCLE_RADIUS}
                      stroke={colors.primary}
                      strokeWidth={STROKE_WIDTH}
                      fill="none"
                    />
                  )}
                </Svg>

                {/* Inner Button */}
                <View
                  style={[
                    styles.innerButton,
                    checkedInToday ? styles.innerButtonChecked : styles.innerButtonUnchecked
                  ]}
                >
                  {/* Icon */}
                  <View style={styles.iconContainer}>
                    {checkedInToday ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={60}
                        color="#fff"
                      />
                    ) : (
                      <Ionicons
                        name="heart"
                        size={60}
                        color={colors.primary}
                      />
                    )}
                  </View>

                  {/* Text Content */}
                  <View style={styles.textContainer}>
                    {checkedInToday ? (
                      <>
                        <Animated.View
                          style={[
                            styles.checkedInTextContainer,
                            { transform: [{ scale: successScaleAnim }] },
                          ]}
                        >
                          <Text style={styles.checkedInText}>{t("home.checkedInToday")}</Text>
                        </Animated.View>
                        <Text style={styles.checkInTime}>
                          {lastCheckinUtc
                            ? "@ " + formatTime24h(new Date(lastCheckinUtc), i18n.language)
                            : ""}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.ctaText}>{t("home.checkIn")}</Text>
                        <Text style={styles.countdownText}>
                          {formatTimeLeft(remainingMs)}
                        </Text>
                        <Text style={styles.timeLeftText}>
                          {t("home.timeLeftToday")}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ========== GROUP 4: WARNING MESSAGE ========== */}
        {!checkedInToday && (
          <View style={[styles.warningGroup, styles.groupContainer]}>
            <View style={styles.warningContainer}>
              <View style={styles.warningIconContainer}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
              </View>
              <Text style={styles.warningText}>
                {t("home.dontForget")}
              </Text>
            </View>
          </View>
        )}

        {/* ========== GROUP 5: ACTION CARDS ========== */}
        <View style={[styles.cardsGroup, styles.groupContainer]}>
          <View style={styles.cardsContainer}>
            {showResetButton ? (
              <TouchableOpacity
                onPress={resetAllState}
                style={[styles.card, styles.resetCard]}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={styles.resetIconContainer}>
                    <Ionicons name="refresh" size={24} color={colors.error} />
                  </View>
                </View>
                <Text style={styles.resetText}>{t("home.reset")}</Text>
                <Text style={styles.cardSubtext}>{t("home.timer")}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/activity")}
                style={styles.card}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <View style={[styles.iconContainerBase, styles.activityIconContainer]}>
                    <Ionicons name="pulse" size={24} color={colors.primary} />
                  </View>
                </View>
                <Text style={styles.cardLabel}>{t("home.activity")}</Text>
                <Text style={styles.cardSubtext}>{t("home.history")}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => router.push("/(tabs)/statistics")}
              style={styles.card}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <View style={[styles.iconContainerBase, styles.streakIconContainer]}>
                  <Ionicons name="flame" size={24} color={colors.primary} />
                </View>
              </View>
              <Text style={styles.cardLabel}>{t("home.streak")}</Text>
              <Text style={styles.streakValue}>
                {t("home.days", { count: streak })}
              </Text>
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingPulse: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: BOTTOM_BUTTON_MARGIN,
  },
  groupContainer: {
    marginBottom: GROUP_GAP,
  },
  headerGroup: {},
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
    textTransform: "capitalize",
    marginLeft: 8,
  },
  displayName: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text.dark,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F3F4F6",
    marginLeft: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  dateTimeGroup: {
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text.dark,
    textAlign: "center",
  },
  dateText: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
    textTransform: "capitalize",
    textAlign: "center",
  },
  checkInGroup: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkInContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkInButton: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  svg: {
    position: "absolute",
  },
  innerButton: {
    width: CIRCLE_SIZE - STROKE_WIDTH * 2 - CIRCLE_GAP * 2,
    height: CIRCLE_SIZE - STROKE_WIDTH * 2 - CIRCLE_GAP * 2,
    borderRadius: (CIRCLE_SIZE - STROKE_WIDTH * 2 - CIRCLE_GAP * 2) / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  innerButtonUnchecked: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  innerButtonChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  iconContainer: {
    marginBottom: 12,
  },
  textContainer: {
    alignItems: "center",
  },
  checkedInTextContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkedInText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  checkInTime: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },
  ctaText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 1,
  },
  countdownText: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  timeLeftText: {
    color: colors.text.light,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
  },
  warningGroup: {},
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.errorLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    alignSelf: 'center',
  },
  warningIconContainer: {
    marginRight: 10,
  },
  warningText: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 15,
    color: colors.error,
  },
  cardsGroup: {},
  cardsContainer: {
    flexDirection: "row",
    gap: 16,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    minHeight: 100,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
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
    backgroundColor: colors.errorLight,
    borderColor: colors.errorBorder,
  },
  cardIcon: {
    marginBottom: 12,
  },
  iconContainerBase: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  activityIconContainer: {
    backgroundColor: "#EDF7F4",
  },
  streakIconContainer: {
    backgroundColor: "#FFF7ED",
  },
  resetIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.errorLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  cardLabel: {
    color: colors.text.dark,
    fontSize: 16,
    fontWeight: "600",
    textAlign: 'center',
  },
  cardSubtext: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  resetText: {
    color: colors.error,
    fontWeight: "700",
    fontSize: 16,
    textAlign: 'center',
  },
  streakValue: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
    color: colors.primary,
    textAlign: 'center',
  },
});