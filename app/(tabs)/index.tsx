// import { Ionicons } from "@expo/vector-icons";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useRouter } from "expo-router";
// import { useCallback, useEffect, useState } from "react";
// import { AppState, Text, TouchableOpacity, View } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { Circle, Svg } from "react-native-svg";
// import { useAuth } from "../../contexts/AuthContext";
// import { supabase } from "../../lib/supabase";

// export default function HomeScreen() {
//   const router = useRouter();
//   const { user, profile, loading } = useAuth();

//   const [now, setNow] = useState(new Date());
//   const [checkedInToday, setCheckedInToday] = useState(false);
//   const [lastCheckin, setLastCheckin] = useState<Date | null>(null);
//   const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
//   const [streak, setStreak] = useState(0);
//   const [showResetButton, setShowResetButton] = useState(false);
//   const [isInitialLoad, setIsInitialLoad] = useState(true);

//   // Get greeting based on time of day
//   const getGreeting = () => {
//     const hour = now.getHours();
//     if (hour >= 5 && hour < 12) return "God morgon";
//     if (hour >= 12 && hour < 18) return "God eftermiddag";
//     if (hour >= 18 && hour < 22) return "God kväll";
//     return "God natt";
//   };

//   const formatTimeLeft = (ms: number) => {
//     const totalSeconds = Math.max(0, Math.floor(ms / 1000));
//     const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
//     const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
//     const s = String(totalSeconds % 60).padStart(2, "0");
//     return `${h}:${m}:${s}`;
//   };

//   const calculateStreak = (dates: Date[]) => {
//     if (!dates.length) return 0;
//     const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());
//     let count = 0;
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     if (sorted[0].toDateString() !== today.toDateString()) return 0;
//     for (let i = 0; i < sorted.length; i++) {
//       const d = new Date(sorted[i]);
//       d.setHours(0, 0, 0, 0);
//       const expected = new Date(today);
//       expected.setDate(today.getDate() - count);
//       if (d.getTime() === expected.getTime()) count++;
//       else break;
//     }
//     return count;
//   };

//   const resetAllState = async () => {
//     setCheckedInToday(false);
//     setLastCheckin(null);
//     setLastCheckinId(null);
//     setShowResetButton(false);
//     await AsyncStorage.removeItem("@checkin_state");
//   };

//   const checkAndResetIfPastMidnight = useCallback(() => {
//     const now = new Date();
//     if ((now.getHours() === 0 && now.getMinutes() === 0) || (now.getHours() === 23 && now.getMinutes() === 59)) {
//       resetAllState();
//     }
//   }, []);

//   // 🔐 Auth guard – wait for auth to finish
//   useEffect(() => {
//     if (loading) return;        // ⛔ wait
//     if (!user) {
//       router.replace("/(auth)/login");
//     }
//   }, [loading, user]);


//   useEffect(() => {
//     const interval = setInterval(() => {
//       setNow(new Date());
//       checkAndResetIfPastMidnight();
//     }, 1000);

//     const subscription = AppState.addEventListener("change", (next) => {
//       if (next === "active") checkAndResetIfPastMidnight();
//     });

//     return () => {
//       clearInterval(interval);
//       subscription.remove();
//     };
//   }, [checkAndResetIfPastMidnight]);

//   useEffect(() => {
//     const loadState = async () => {
//       const saved = await AsyncStorage.getItem("@checkin_state");
//       if (saved) {
//         const { checkedInToday: c, lastCheckin: l } = JSON.parse(saved);
//         setCheckedInToday(c);
//         setLastCheckin(l ? new Date(l) : null);
//         setShowResetButton(c);
//       }
//       setIsInitialLoad(false);
//     };
//     loadState();
//   }, []);

//   const fetchStreak = async () => {
//     try {
//       const { data: { user: authUser } } = await supabase.auth.getUser();
//       if (!authUser) return;
//       const { data: checkins } = await supabase
//         .from("checkins")
//         .select("created_at,id")
//         .eq("user_id", authUser.id)
//         .order("created_at", { ascending: false });

//       if (!checkins) {
//         setStreak(0);
//         return;
//       }
//       const dates = checkins.map(c => new Date(c.created_at));
//       setStreak(calculateStreak(dates));
//     } catch (err) {
//       console.error(err);
//       setStreak(0);
//     }
//   };

//   const handleCheckIn = async () => {
//     try {
//       if (!user) throw new Error("No user found");

//       // Update UI immediately with current time
//       const now = new Date();
//       setCheckedInToday(true);
//       setShowResetButton(true);
//       setLastCheckin(now);

//       // Save to local storage immediately
//       await AsyncStorage.setItem("@checkin_state", JSON.stringify({
//         checkedInToday: true,
//         lastCheckin: now
//       }));

//       // Always make Supabase API call to create new check-in record
//       const { data, error } = await supabase
//         .from("checkins")
//         .insert({ user_id: user.id })
//         .select()
//         .single();

//       if (error) throw error;

//       if (data?.id) setLastCheckinId(data.id);

//       // Update streak after new check-in
//       await fetchStreak();

//     } catch (err) {
//       console.error("Check-in error:", err);
//       // If Supabase fails, we still keep the local check-in state
//       // so the user sees they checked in
//     }
//   };

//   const size = 250;
//   const strokeWidth = 12;
//   const radius = (size - strokeWidth) / 2;
//   const gap = 6;

//   const startOfDay = new Date();
//   startOfDay.setHours(0, 0, 0, 0);
//   const totalMsInDay = 24 * 60 * 60 * 1000;
//   const elapsedMs = now.getTime() - startOfDay.getTime();
//   const progress = Math.min(elapsedMs / totalMsInDay, 1);
//   const remainingMs = Math.max(0, totalMsInDay - elapsedMs);

//   if (loading || isInitialLoad) {
//     return <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} />;
//   }


//   const NameSkeleton = () => (
//     <View
//       style={{
//         width: 180,
//         height: 34,
//         borderRadius: 8,
//         backgroundColor: "#E5E7EB",
//         marginTop: 6,
//         opacity: 0.6,
//       }}
//     />
//   );

//   return (
//     <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}>
//       {/* Header */}
//       <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
//         <View>
//           <Text style={{ fontSize: 14, color: "#5E7F74", fontWeight: "500" }}>
//             {getGreeting()}
//           </Text>
//           {loading ? (
//             <NameSkeleton />
//           ) : (
//             <Text style={{ fontSize: 32, fontWeight: "700", marginTop: 2 }}>
//               {profile?.display_name}
//             </Text>
//           )}
//         </View>

//         <TouchableOpacity
//           onPress={() => router.push("/(tabs)/profile")}
//           style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}
//         >
//           <Ionicons name="person-outline" size={22} />
//         </TouchableOpacity>
//       </View>

//       {/* Date */}
//       <View style={{ alignItems: "center", marginTop: 10 }}>
//         <Text style={{ fontSize: 16, color: "#5E7F74" }}>
//           {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
//         </Text>
//         <Text style={{ fontSize: 16, color: "#5E7F74", marginTop: 4 }}>
//           {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
//         </Text>
//       </View>

//       {/* Check-in Button */}
//       <View style={{ alignItems: "center", marginTop: 30 }}>
//         <TouchableOpacity
//           onPress={handleCheckIn}
//           style={{ width: size, height: size, alignItems: "center", justifyContent: "center", position: "relative" }}
//         // Allow multiple check-ins
//         >
//           {/* Outer circle - Show progress bar only when not checked in */}
//           {!checkedInToday ? (
//             <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
//               <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none" />
//               <Circle
//                 cx={size / 2}
//                 cy={size / 2}
//                 r={radius}
//                 stroke="#5FA893"
//                 strokeWidth={strokeWidth}
//                 fill="none"
//                 strokeDasharray={2 * Math.PI * radius}
//                 strokeDashoffset={2 * Math.PI * radius * (1 - progress)}
//                 strokeLinecap="round"
//               />
//             </Svg>
//           ) : (
//             // When checked in, show a complete circle with the same color
//             <Svg width={size} height={size} style={{ position: "absolute" }}>
//               <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#5FA893" strokeWidth={strokeWidth} fill="none" />
//             </Svg>
//           )}

//           {/* Inner button with GAP */}
//           <View
//             style={{
//               width: size - strokeWidth * 2 - gap * 2,
//               height: size - strokeWidth * 2 - gap * 2,
//               borderRadius: (size - strokeWidth * 2 - gap * 2) / 2,
//               backgroundColor: checkedInToday ? "#5FA893" : "#F0F9F6",
//               alignItems: "center",
//               justifyContent: "center",
//               borderWidth: 3,
//               borderColor: "#5FA893",
//             }}
//           >
//             <Ionicons
//               name={checkedInToday ? "checkmark-circle" : "heart"}
//               size={56}
//               color={checkedInToday ? "white" : "#5FA893"}
//             />

//             {checkedInToday ? (
//               <>
//                 <Text style={{ color: "white", fontSize: 28, fontWeight: "700", marginTop: 8 }}>
//                   Checked In
//                 </Text>
//                 <Text style={{ color: "white", fontSize: 16, marginTop: 4, fontWeight: "600" }}>
//                   {lastCheckin?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || ""}
//                 </Text>
//               </>
//             ) : (
//               <>
//                 <Text style={{ color: "#5FA893", fontSize: 28, fontWeight: "700", marginTop: 8 }}>
//                   {formatTimeLeft(remainingMs)}
//                 </Text>
//                 <Text style={{ color: "#5FA893", fontSize: 12, marginTop: 10, fontWeight: "600" }}>
//                   KLICKA PÅ MIG
//                 </Text>
//               </>
//             )}
//           </View>
//         </TouchableOpacity>

//         {/* Status message */}
//         <Text style={{ textAlign: "center", marginTop: 28, fontWeight: "700", fontSize: 14, color: checkedInToday ? "#5E7F74" : "red" }}>
//           {!checkedInToday && "YOU HAVE NOT CHECKED IN TODAY!"}
//         </Text>
//       </View>

//       {/* Cards */}
//       <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40, paddingHorizontal: 8 }}>
//         {showResetButton ? (
//           <TouchableOpacity
//             onPress={resetAllState}
//             style={{
//               width: "48%",
//               backgroundColor: "#FEF3F2",
//               borderRadius: 16,
//               padding: 16,
//               alignItems: "center",
//               borderWidth: 1,
//               borderColor: "#FCA5A5",
//             }}
//           >
//             <Ionicons name="refresh" size={28} color="#DC2626" />
//             <Text style={{ color: "#DC2626", fontWeight: "600", marginTop: 10 }}>Återställ Timer</Text>
//           </TouchableOpacity>
//         ) : (
//           <TouchableOpacity
//             onPress={() => router.push("/(tabs)/activities")}
//             style={{
//               width: "48%",
//               backgroundColor: "#F0F9F6",
//               borderRadius: 16,
//               padding: 16,
//               alignItems: "center",
//               borderWidth: 1,
//               borderColor: "#E0F2E9",
//             }}
//           >
//             <Text style={{ color: "#5E7F74", fontSize: 14, fontWeight: "600" }}>Aktivitet</Text>
//             <Ionicons name="list" size={28} color="#5FA893" style={{ marginTop: 8 }} />
//           </TouchableOpacity>
//         )}

//         <TouchableOpacity
//           onPress={() => router.push("/(tabs)/statistics")}
//           style={{
//             width: "48%",
//             backgroundColor: "#F0F9F6",
//             borderRadius: 16,
//             padding: 16,
//             alignItems: "center",
//             borderWidth: 1,
//             borderColor: "#E0F2E9",
//           }}
//         >
//           <Text style={{ color: "#5E7F74", fontSize: 14, fontWeight: "600" }}>Streak</Text>
//           <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 8, color: "#5FA893" }}>
//             {streak} {streak === 1 ? "dag" : "dagar"}
//           </Text>
//         </TouchableOpacity>
//       </View>

//     </SafeAreaView>
//   );
// }


import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
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
};

const CIRCLE_SIZE = 250;
const STROKE_WIDTH = 12;
const CIRCLE_RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCLE_GAP = 6;

const STORAGE_KEY = "@checkin_state";
const MS_IN_DAY = 24 * 60 * 60 * 1000;

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

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const successScaleAnim = useRef(new Animated.Value(0)).current;

  // ==================== ANIMATION EFFECTS ====================

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Subtle pulse when not checked in
  useEffect(() => {
    if (!checkedInToday && !isInitialLoad) {
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
      return () => pulse.stop();
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
    } else {
      successScaleAnim.setValue(0);
    }
  }, [checkedInToday]);

  // ==================== HANDLERS ====================

  const triggerCheckInAnimation = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
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

              {/* Inner Button */}
              <View
                style={[
                  styles.innerButton,
                  {
                    backgroundColor: checkedInToday ? colors.primary : colors.primaryLight,
                    borderColor: colors.primary,
                  },
                ]}
              >
                <Ionicons
                  name={checkedInToday ? "checkmark-circle" : "heart"}
                  size={56}
                  color={checkedInToday ? colors.surface : colors.primary}
                />

                {checkedInToday ? (
                  <Animated.View
                    style={[
                      styles.checkedInContent,
                      { transform: [{ scale: successScaleAnim }] },
                    ]}
                  >
                    <Text style={styles.checkedInText}>Incheckad!</Text>
                    <Text style={styles.checkInTime}>
                      {lastCheckin?.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }) || ""}
                    </Text>
                  </Animated.View>
                ) : (
                  <>
                    <Text style={styles.countdownText}>
                      {formatTimeLeft(remainingMs)}
                    </Text>
                    <Text style={styles.ctaText}>TRYCK FÖR ATT{'\n'}CHECKA IN</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Warning message */}
          {!checkedInToday && (
            <View style={styles.warningContainer}>
              <Ionicons name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.warningText}>
                Du har inte checkat in idag!
              </Text>
            </View>
          )}
        </View>

        {/* ========== ACTION CARDS ========== */}
        <View style={styles.cardsContainer}>
          {showResetButton ? (
            <TouchableOpacity
              onPress={resetAllState}
              style={[styles.card, styles.resetCard]}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={28} color={colors.error} />
              <Text style={styles.resetText}>Återställ</Text>
              <Text style={styles.cardSubtext}>Timer</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/activities")}
              style={styles.card}
              activeOpacity={0.8}
            >
              <Text style={styles.cardLabel}>Aktivitet</Text>
              <Ionicons name="list" size={28} color={colors.primary} style={{ marginTop: 8 }} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.push("/(tabs)/statistics")}
            style={styles.card}
            activeOpacity={0.8}
          >
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
    backgroundColor: colors.surface,
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
    padding: 24,
    paddingBottom: 0,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Date & Time
  dateContainer: {
    alignItems: "center",
    marginTop: 10,
  },
  timeText: {
    fontSize: 16,
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
    alignItems: "center",
    marginTop: 30,
    flex: 1,
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
  checkedInContent: {
    alignItems: "center",
  },
  checkedInText: {
    color: colors.surface,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  checkInTime: {
    color: colors.surface,
    fontSize: 16,
    marginTop: 4,
    fontWeight: "600",
  },
  countdownText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  ctaText: {
    color: colors.primary,
    fontSize: 12,
    marginTop: 10,
    fontWeight: "600",
    textAlign: "center",
  },

  // Warning
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    gap: 6,
  },
  warningText: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 14,
    color: colors.error,
  },

  // Action Cards
  cardsContainer: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  resetCard: {
    backgroundColor: colors.errorLight,
    borderColor: colors.errorBorder,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  cardSubtext: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  resetText: {
    color: colors.error,
    fontWeight: "600",
    marginTop: 10,
  },
  streakValue: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 8,
    color: colors.primary,
  },
});
