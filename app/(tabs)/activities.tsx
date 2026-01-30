import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Activity = {
  user_id: string;
  display_name: string;
  last_checkin: string | null;
  priority: number;
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all latest check-ins once
  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from("user_latest_checkins")
        .select("*") as { data: Activity[] | null; error: any };

      if (error) throw error;

      // Optional: sort by priority descending, then last_checkin descending
      const sorted = (data ?? []).sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (b.last_checkin ?? "").localeCompare(a.last_checkin ?? "");
      });

      setActivities(sorted);
    } catch (err) {
      console.error("Failed to load activities:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("latest-checkins-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_latest_checkins" },
        (payload) => {
          if (!payload.new) return;
          const updated: Activity = payload.new as Activity;

          setActivities((prev) => {
            const index = prev.findIndex((a) => a.user_id === updated.user_id);
            if (index !== -1) {
              // Replace existing user
              const copy = [...prev];
              copy[index] = updated;
              return copy;
            } else {
              // Add new user
              return [...prev, updated];
            }
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}
    >
      <ScrollView style={{ flex: 1 }}>
        <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 24 }}>
          Aktivitet
        </Text>

        {loading && <Text>Laddar...</Text>}

        {!loading &&
          activities.map((item) => (
            <ActivityItem
              key={item.user_id}
              name={item.display_name}
              timestamp={item.last_checkin}
              priority={item.priority}
            />
          ))}
      </ScrollView>

      {/* Bottom navigation */}
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
          <Ionicons name="home-outline" size={24} color="#9CA3AF" />
          <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Hem</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)/activities")}>
          <Ionicons name="list" size={24} color="#5FA893" />
          <Text style={{ fontSize: 12, color: "#5FA893", marginTop: 4 }}>Aktivitet</Text>
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

function ActivityItem({
  name,
  timestamp,
  priority,
}: {
  name: string;
  timestamp: string | null;
  priority: number;
}) {
  const color =
    priority === 2 ? "#EF4444" :
      priority === 1 ? "#F59E0B" :
        "#22C55E";

  let statusText = "Ingen aktivitet ännu";

  if (timestamp) {
    const d = new Date(timestamp);
    const dateStr = d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    statusText = `Senast bekräftat ${dateStr} ${timeStr}`;
  }

  return (
    <View style={{ flexDirection: "row", marginBottom: 20 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
          marginTop: 6,
          marginRight: 12,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{name}</Text>
        <Text style={{ color, marginTop: 4 }}>{statusText}</Text>
      </View>
    </View>
  );
}
