import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

// ==================== CONSTANTS ====================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const colors = {
  primary: "#5FA893",
  primaryLight: "#F0F9F6",
  primaryBorder: "#E0F2E9",
  textDark: "#1F2937",
  textMuted: "#5E7F74",
  textLight: "#9CA3AF",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  error: "#DC2626",
  errorLight: "#FEF3F2",
  errorBorder: "#FCA5A5",
  background: "#FAFAFA",
};

const CIRCLE_SIZE = Math.min(SCREEN_WIDTH * 0.68, 260);
const STROKE_WIDTH = 12;
const CIRCLE_RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCLE_GAP = 6;

const STORAGE_KEY = "@checkin_state";
const MS_IN_DAY = 24 * 60 * 60 * 1000;

// Platform-specific adjustments
const IS_IOS = Platform.OS === 'ios';
const BOTTOM_BUTTON_MARGIN = IS_IOS ? 20 : 10;

// ==================== UTILITY FUNCTIONS ====================

const getGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "God morgon";
  if (hour >= 12 && hour < 18) return "God eftermiddag";
  if (hour >= 18 && hour < 22) return "God kväll";
  return "God natt";
};

const formatTimeLeft = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const calculateStreak = (dates: Date[]): number => {
  if (!dates.length) return 0;
  const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());
  let count = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (sorted[0].toDateString() !== today.toDateString()) return 0;
  for (let i = 0; i < sorted.length; i++) {
    const d = new Date(sorted[i]);
    d.setHours(0, 0, 0, 0);
    const expected = new Date(today);
    expected.setDate(today.getDate() - count);
    if (d.getTime() === expected.getTime()) count++;
    else break;
  }
  return count;
};

const isNearMidnight = (date: Date): boolean => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return (hours === 0 && minutes === 0) || (hours === 23 && minutes === 59);
};

// ==================== MAIN COMPONENT ====================

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  // State
  const [now, setNow] = useState(new Date());
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [lastCheckin, setLastCheckin] = useState<Date | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [showResetButton, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  const heartBeatAnim = useRef(new Animated.Value(1)).current;

  // ==================== ANIMATION EFFECTS ====================

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
      // Main button pulse animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      // Heart beat animation
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
          Animated.delay(800),
          Animated.timing(heartBeatAnim, {
            toValue: 1.1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(heartBeatAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.delay(600),
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
      heartBeatAnim.setValue(1); // Reset heart animation
    } else {
      successScaleAnim.setValue(0);
    }
  }, [checkedInToday]);

  // ==================== HANDLERS ====================

  const triggerCheckInAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Heart pulse effect when pressing
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
    setLastCheckin(null);
    setLastCheckinId(null);
    setShowResetButton(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const checkAndResetIfPastMidnight = useCallback(() => {
    if (isNearMidnight(new Date())) {
      resetAllState();
    }
  }, [resetAllState]);

  const fetchStreak = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) return;

      const { data: checkins } = await supabase
        .from("checkins")
        .select("created_at,id")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (!checkins) {
        setStreak(0);
        return;
      }

      const dates = checkins.map((c) => new Date(c.created_at));
      setStreak(calculateStreak(dates));
    } catch (err) {
      console.error("Error fetching streak:", err);
      setStreak(0);
    }
  };

  const handleCheckIn = useCallback(async () => {
    try {
      if (!user) throw new Error("No user found");

      const checkInTime = new Date();

      // Update local state
      setCheckedInToday(true);
      setShowResetButton(true);
      setLastCheckin(checkInTime);

      // Trigger animation
      triggerCheckInAnimation();

      // Save to local storage
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          checkedInToday: true,
          lastCheckin: checkInTime,
        })
      );

      // Save to database
      const { data, error } = await supabase
        .from("checkins")
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      if (data?.id) setLastCheckinId(data.id);

      // Update streak
      await fetchStreak();
    } catch (err) {
      console.error("Check-in error:", err);
    }
  }, [user]);

  // ==================== LIFECYCLE EFFECTS ====================

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
        if (saved) {
          const { checkedInToday: c, lastCheckin: l } = JSON.parse(saved);
          setCheckedInToday(c);
          setLastCheckin(l ? new Date(l) : null);
          setShowResetButton(c);
        }
      } catch (err) {
        console.error("Error loading state:", err);
      } finally {
        setIsInitialLoad(false);
      }
    };
    loadState();
  }, []);

  // ==================== CALCULATIONS ====================

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const elapsedMs = now.getTime() - startOfDay.getTime();
  const progress = Math.min(elapsedMs / MS_IN_DAY, 1);
  const remainingMs = Math.max(0, MS_IN_DAY - elapsedMs);

  // ==================== RENDER ====================

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

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[styles.content, { opacity: fadeAnim }]}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setContainerHeight(height);
        }}
      >
        {/* ========== HEADER ========== */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting(now)}</Text>
            <Text style={styles.displayName} numberOfLines={1}>
              {profile?.display_name || "Välkommen"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={22} color={colors.textDark} />
          </TouchableOpacity>
        </View>

        {/* ========== DATE & TIME ========== */}
        <View style={styles.dateContainer}>
          <Text style={styles.timeText}>
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={styles.dateText}>
            {now.toLocaleDateString("sv-SE", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>

        {/* ========== CHECK-IN BUTTON ========== */}
        <View style={styles.checkInContainer}>
          <Animated.View
            style={{
              transform: [{ scale: Animated.multiply(pulseAnim, scaleAnim) }],
              position: 'absolute',
              top: containerHeight > 0 ? (containerHeight - CIRCLE_SIZE) / 2 : '30%',
            }}
          >
            <TouchableOpacity
              onPress={handleCheckIn}
              activeOpacity={0.9}
              style={[styles.checkInButton, { width: CIRCLE_SIZE, height: CIRCLE_SIZE }]}
            >
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
                  stroke={colors.border}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                />

                {/* Progress/Complete circle */}
                {!checkedInToday ? (
                  <Circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={CIRCLE_RADIUS}
                    stroke="url(#gradient)"
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                    strokeDasharray={2 * Math.PI * CIRCLE_RADIUS}
                    strokeDashoffset={2 * Math.PI * CIRCLE_RADIUS * (1 - progress)}
                    strokeLinecap="round"
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

              {/* Inner Button with ABSOLUTE positioned elements */}
              <View
                style={[
                  styles.innerButton,
                  {
                    backgroundColor: checkedInToday ? colors.primary : colors.primaryLight,
                    borderColor: colors.primary,
                  },
                ]}
              >
                {/* Icon - Absolutely positioned with animation */}
                <View style={styles.iconContainer}>
                  {checkedInToday ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={56}
                      color={colors.surface}
                    />
                  ) : (
                    <Animated.View
                      style={{
                        transform: [{ scale: heartBeatAnim }],
                      }}
                    >
                      <Ionicons
                        name="heart"
                        size={56}
                        color={colors.primary}
                      />
                    </Animated.View>
                  )}
                </View>

                {checkedInToday ? (
                  <>
                    {/* "Incheckad!" text - Absolutely positioned */}
                    <View style={styles.mainTextContainer}>
                      <Animated.View
                        style={[
                          styles.checkedInTextContainer,
                          { transform: [{ scale: successScaleAnim }] },
                        ]}
                      >
                        <Text style={styles.checkedInText}>Incheckad!</Text>
                      </Animated.View>
                    </View>

                    {/* Check-in time - Absolutely positioned */}
                    <View style={styles.timeContainer}>
                      <Text style={styles.checkInTime}>
                        {lastCheckin?.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        }) || ""}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    {/* "CHECKA IN" text - Absolutely positioned */}
                    <View style={styles.mainTextContainer}>
                      <Text style={styles.ctaText}>CHECKA IN HÄR</Text>
                    </View>

                    {/* Countdown time - Absolutely positioned */}
                    <View style={styles.timeContainer}>
                      <Text style={styles.countdownText}>
                        {formatTimeLeft(remainingMs)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Warning message */}
          {!checkedInToday && (
            <View style={[
              styles.warningContainer,
              {
                position: 'absolute',
                bottom: BOTTOM_BUTTON_MARGIN + 135,
              }]}
            >
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.warningText}>
                Du har inte checkat in idag!
              </Text>
            </View>
          )}
        </View>

        {/* ========== ACTION CARDS ========== */}
        <View style={[
          styles.cardsContainer,
          {
            marginBottom: BOTTOM_BUTTON_MARGIN,
            marginTop: containerHeight > 0 ? 'auto' : 0,
          }
        ]}>
          {showResetButton ? (
            <TouchableOpacity
              onPress={resetAllState}
              style={[styles.card, styles.resetCard]}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="refresh" size={24} color={colors.error} />
              </View>
              <Text style={styles.resetText}>Återställ</Text>
              <Text style={styles.cardSubtext}>Timer</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/activity")}
              style={styles.card}
              activeOpacity={0.8}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="list" size={24} color={colors.primary} />
              </View>
              <Text style={styles.cardLabel}>Aktivitet</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.push("/(tabs)/statistics")}
            style={styles.card}
            activeOpacity={0.8}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="flame" size={24} color={colors.primary} />
            </View>
            <Text style={styles.cardLabel}>Streak</Text>
            <Text style={styles.streakValue}>
              {streak} {streak === 1 ? "dag" : "dagar"}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================

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
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  displayName: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textDark,
    marginTop: 2,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: 12,
  },

  // Date & Time
  dateContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  timeText: {
    fontSize: 26,
    color: colors.textMuted,
    fontWeight: "500",
  },
  dateText: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 4,
    textTransform: "capitalize",
  },

  // Check-in Button
  checkInContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    position: 'relative',
  },

  // Absolute positioned elements inside the button
  iconContainer: {
    position: 'absolute',
    top: '15%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mainTextContainer: {
    position: 'absolute',
    top: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -10 }],
  },

  timeContainer: {
    position: 'absolute',
    bottom: '20%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkedInTextContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkedInText: {
    color: colors.surface,
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
  },
  checkInTime: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  ctaText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 30,
  },
  countdownText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },

  // Warning
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.errorLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    alignSelf: 'center',
  },
  warningText: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
    color: colors.error,
  },

  // Action Cards
  cardsContainer: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 110,
    maxHeight: 120,
    justifyContent: 'space-between',
  },
  resetCard: {
    backgroundColor: colors.errorLight,
    borderColor: colors.errorBorder,
  },
  cardIcon: {
    marginBottom: 8,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: 'center',
  },
  cardSubtext: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  resetText: {
    color: colors.error,
    fontWeight: "600",
    fontSize: 15,
    textAlign: 'center',
  },
  streakValue: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
    color: colors.primary,
    textAlign: 'center',
  },
});