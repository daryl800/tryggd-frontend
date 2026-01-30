import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Circle, Svg } from "react-native-svg";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  const [now, setNow] = useState(new Date());
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [lastCheckin, setLastCheckin] = useState<Date | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [showResetButton, setShowResetButton] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const isActive = (tab: string) => tab === "home";

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return "God morgon";
    if (hour >= 12 && hour < 18) return "God eftermiddag";
    if (hour >= 18 && hour < 22) return "God kväll";
    return "God natt";
  };

  const formatTimeLeft = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const calculateStreak = (dates: Date[]) => {
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

  const resetAllState = async () => {
    setCheckedInToday(false);
    setLastCheckin(null);
    setLastCheckinId(null);
    setShowResetButton(false);
    await AsyncStorage.removeItem("@checkin_state");
  };

  const checkAndResetIfPastMidnight = useCallback(() => {
    const now = new Date();
    if ((now.getHours() === 0 && now.getMinutes() === 0) || (now.getHours() === 23 && now.getMinutes() === 59)) {
      resetAllState();
    }
  }, []);

  // 🔐 Auth guard – wait for auth to finish
  useEffect(() => {
    if (loading) return;        // ⛔ wait
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
      if (next === "active") checkAndResetIfPastMidnight();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkAndResetIfPastMidnight]);

  useEffect(() => {
    const loadState = async () => {
      const saved = await AsyncStorage.getItem("@checkin_state");
      if (saved) {
        const { checkedInToday: c, lastCheckin: l } = JSON.parse(saved);
        setCheckedInToday(c);
        setLastCheckin(l ? new Date(l) : null);
        setShowResetButton(c);
      }
      setIsInitialLoad(false);
    };
    loadState();
  }, []);

  const fetchStreak = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
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
      const dates = checkins.map(c => new Date(c.created_at));
      setStreak(calculateStreak(dates));
    } catch (err) {
      console.error(err);
      setStreak(0);
    }
  };

  const handleCheckIn = async () => {
    try {
      if (!user) throw new Error("No user found");

      // Update UI immediately with current time
      const now = new Date();
      setCheckedInToday(true);
      setShowResetButton(true);
      setLastCheckin(now);

      // Save to local storage immediately
      await AsyncStorage.setItem("@checkin_state", JSON.stringify({
        checkedInToday: true,
        lastCheckin: now
      }));

      // Always make Supabase API call to create new check-in record
      const { data, error } = await supabase
        .from("checkins")
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw error;

      if (data?.id) setLastCheckinId(data.id);

      // Update streak after new check-in
      await fetchStreak();

    } catch (err) {
      console.error("Check-in error:", err);
      // If Supabase fails, we still keep the local check-in state
      // so the user sees they checked in
    }
  };

  const size = 250;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const gap = 6;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const totalMsInDay = 24 * 60 * 60 * 1000;
  const elapsedMs = now.getTime() - startOfDay.getTime();
  const progress = Math.min(elapsedMs / totalMsInDay, 1);
  const remainingMs = Math.max(0, totalMsInDay - elapsedMs);

  if (loading || isInitialLoad) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} />;
  }


  const NameSkeleton = () => (
    <View
      style={{
        width: 180,
        height: 34,
        borderRadius: 8,
        backgroundColor: "#E5E7EB",
        marginTop: 6,
        opacity: 0.6,
      }}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <View>
          <Text style={{ fontSize: 14, color: "#5E7F74", fontWeight: "500" }}>
            {getGreeting()}
          </Text>
          {loading ? (
            <NameSkeleton />
          ) : (
            <Text style={{ fontSize: 32, fontWeight: "700", marginTop: 2 }}>
              {profile?.display_name}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => router.push("/(tabs)/profile")}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="person-outline" size={22} />
        </TouchableOpacity>
      </View>

      {/* Date */}
      <View style={{ alignItems: "center", marginTop: 10 }}>
        <Text style={{ fontSize: 16, color: "#5E7F74" }}>
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        <Text style={{ fontSize: 16, color: "#5E7F74", marginTop: 4 }}>
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </Text>
      </View>

      {/* Check-in Button */}
      <View style={{ alignItems: "center", marginTop: 30 }}>
        <TouchableOpacity
          onPress={handleCheckIn}
          style={{ width: size, height: size, alignItems: "center", justifyContent: "center", position: "relative" }}
        // Allow multiple check-ins
        >
          {/* Outer circle - Show progress bar only when not checked in */}
          {!checkedInToday ? (
            <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none" />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#5FA893"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={2 * Math.PI * radius}
                strokeDashoffset={2 * Math.PI * radius * (1 - progress)}
                strokeLinecap="round"
              />
            </Svg>
          ) : (
            // When checked in, show a complete circle with the same color
            <Svg width={size} height={size} style={{ position: "absolute" }}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#5FA893" strokeWidth={strokeWidth} fill="none" />
            </Svg>
          )}

          {/* Inner button with GAP */}
          <View
            style={{
              width: size - strokeWidth * 2 - gap * 2,
              height: size - strokeWidth * 2 - gap * 2,
              borderRadius: (size - strokeWidth * 2 - gap * 2) / 2,
              backgroundColor: checkedInToday ? "#5FA893" : "#F0F9F6",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 3,
              borderColor: "#5FA893",
            }}
          >
            <Ionicons
              name={checkedInToday ? "checkmark-circle" : "heart"}
              size={56}
              color={checkedInToday ? "white" : "#5FA893"}
            />

            {checkedInToday ? (
              <>
                <Text style={{ color: "white", fontSize: 28, fontWeight: "700", marginTop: 8 }}>
                  Checked In
                </Text>
                <Text style={{ color: "white", fontSize: 16, marginTop: 4, fontWeight: "600" }}>
                  {lastCheckin?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || ""}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: "#5FA893", fontSize: 28, fontWeight: "700", marginTop: 8 }}>
                  {formatTimeLeft(remainingMs)}
                </Text>
                <Text style={{ color: "#5FA893", fontSize: 12, marginTop: 10, fontWeight: "600" }}>
                  KLICKA PÅ MIG
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Status message */}
        <Text style={{ textAlign: "center", marginTop: 28, fontWeight: "700", fontSize: 14, color: checkedInToday ? "#5E7F74" : "red" }}>
          {!checkedInToday && "YOU HAVE NOT CHECKED IN TODAY!"}
        </Text>
      </View>

      {/* Cards */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40, paddingHorizontal: 8 }}>
        {showResetButton ? (
          <TouchableOpacity
            onPress={resetAllState}
            style={{
              width: "48%",
              backgroundColor: "#FEF3F2",
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#FCA5A5",
            }}
          >
            <Ionicons name="refresh" size={28} color="#DC2626" />
            <Text style={{ color: "#DC2626", fontWeight: "600", marginTop: 10 }}>Återställ Timer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/activities")}
            style={{
              width: "48%",
              backgroundColor: "#F0F9F6",
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E0F2E9",
            }}
          >
            <Text style={{ color: "#5E7F74", fontSize: 14, fontWeight: "600" }}>Aktivitet</Text>
            <Ionicons name="pulse" size={28} color="#5FA893" style={{ marginTop: 8 }} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => router.push("/(tabs)/statistics")}
          style={{
            width: "48%",
            backgroundColor: "#F0F9F6",
            borderRadius: 16,
            padding: 16,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E0F2E9",
          }}
        >
          <Text style={{ color: "#5E7F74", fontSize: 14, fontWeight: "600" }}>Streak</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", marginTop: 8, color: "#5FA893" }}>
            {streak} {streak === 1 ? "dag" : "dagar"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Tabs */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          marginTop: "auto",
          paddingVertical: 16,
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)")}>
          <Ionicons name={isActive("home") ? "home" : "home-outline"} size={24} color={isActive("home") ? "#5FA893" : "#9CA3AF"} />
          <Text style={{ fontSize: 12, color: "#5FA893", marginTop: 4 }}>Hem</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)/activities")}>
          <Ionicons name="pulse-outline" size={24} color="#9CA3AF" />
          <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Aktivitet</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)/contacts")}>
          <Ionicons name="people-outline" size={24} color="#9CA3AF" />
          <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Kontakter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)/profile")}>
          <Ionicons name="person-outline" size={24} color="#9CA3AF" />
          <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Profil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}