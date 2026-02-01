import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Activity = {
  user_id: string;
  display_name: string;
  last_checkin: string | null;
  priority: number;
  email?: string | null;
};

export default function ActivityScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const contactMapRef = useRef<Map<string, { email: string; display_name: string }>>(new Map());
  const currentUserId = useRef<string | null>(null);

  // 1. Fetching Logic
  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      currentUserId.current = user.id;

      // Fetch contacts to build map
      const { data: contactsData } = await supabase
        .from("contacts")
        .select("contact_user_id, contact_email, contact_display_name")
        .eq("owner_user_id", user.id);

      const map = new Map<string, { email: string; display_name: string }>();
      const contactIds: string[] = [];
      contactsData?.forEach(c => {
        map.set(c.contact_user_id, {
          email: c.contact_email || '',
          display_name: c.contact_display_name || ''
        });
        contactIds.push(c.contact_user_id);
      });
      contactMapRef.current = map;

      // Fetch latest checkins for both owner and contacts
      const allIds = [user.id, ...contactIds];
      const { data: checkins, error } = await supabase
        .from("user_latest_checkins")
        .select("*")
        .in("user_id", allIds);

      if (error) throw error;

      // Separate Owner vs Contacts
      const owner = checkins?.find(c => c.user_id === user.id) || null;
      const others = checkins
        ?.filter(c => c.user_id !== user.id)
        .map(activity => ({
          ...activity,
          display_name: map.get(activity.user_id)?.display_name || activity.display_name,
          email: map.get(activity.user_id)?.email || null,
        }))
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return (b.last_checkin ?? "").localeCompare(a.last_checkin ?? "");
        });

      setOwnerActivity(owner);
      setActivities(others || []);

      // Setup Realtime with the IDs we just fetched
      setupRealtime(user.id, contactIds);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 2. Realtime Logic
  const setupRealtime = (userId: string, contactIds: string[]) => {
    if (checkinsChannelRef.current) supabase.removeChannel(checkinsChannelRef.current);

    const allMonitoredIds = [userId, ...contactIds];

    checkinsChannelRef.current = supabase
      .channel("activity-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_latest_checkins",
          filter: `user_id=in.(${allMonitoredIds.join(',')})`
        },
        (payload) => {
          const updated = payload.new as Activity;
          if (!updated) return;

          if (updated.user_id === userId) {
            setOwnerActivity(updated);
          } else {
            setActivities(prev => {
              const contactInfo = contactMapRef.current.get(updated.user_id);
              const enriched = {
                ...updated,
                display_name: contactInfo?.display_name || updated.display_name,
                email: contactInfo?.email || null,
              };
              const filtered = prev.filter(a => a.user_id !== updated.user_id);
              return [enriched, ...filtered].sort((a, b) => {
                if (b.priority !== a.priority) return b.priority - a.priority;
                return (b.last_checkin ?? "").localeCompare(a.last_checkin ?? "");
              });
            });
          }
        }
      )
      .subscribe();
  };

  // 3. Lifecycle Hooks
  useEffect(() => {
    fetchData();
    return () => {
      if (checkinsChannelRef.current) supabase.removeChannel(checkinsChannelRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} />}
      >
        <Text style={styles.headerTitle}>Aktivitet</Text>

        <Text style={styles.sectionLabel}>Min Status</Text>
        {ownerActivity ? (
          <ActivityItem
            name="Du (Mig)"
            email="Ditt konto"
            timestamp={ownerActivity.last_checkin}
            priority={ownerActivity.priority}
            isOwner
          />
        ) : (
          <View style={styles.emptyCard}><Text>Ingen status än</Text></View>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Kontakter</Text>
        {loading ? (
          <Text style={styles.loadingText}>Laddar...</Text>
        ) : activities.length === 0 ? (
          <Text style={styles.emptyText}>Inga aktiva kontakter.</Text>
        ) : (
          activities.map((item) => (
            <ActivityItem
              key={item.user_id}
              name={item.display_name}
              email={item.email}
              timestamp={item.last_checkin}
              priority={item.priority}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Beautified ActivityItem Component
function ActivityItem({ name, email, timestamp, priority, isOwner }: any) {
  const getStatus = (p: number) => {
    if (p === 2) return { color: "#EF4444", label: "Akut" };
    if (p === 1) return { color: "#F59E0B", label: "Varning" };
    return { color: "#22C55E", label: "OK" };
  };

  const status = getStatus(priority);
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString("sv-SE", { hour: '2-digit', minute: '2-digit' })
    : "--:--";
  const dateStr = timestamp
    ? new Date(timestamp).toLocaleDateString("sv-SE", { day: 'numeric', month: 'short' })
    : "";

  return (
    <View style={[styles.card, isOwner && styles.ownerCard]}>
      <View style={[styles.indicator, { backgroundColor: status.color }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.row}>
          <Text style={styles.name}>{name}</Text>
          {email && <Text style={styles.email}>{email}</Text>}
        </View>
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.label} • {dateStr} kl {timeStr}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  scrollContent: { padding: 20 },
  headerTitle: { fontSize: 34, fontWeight: "800", color: "#111827", marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#6B7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 25 },
  card: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3
  },
  ownerCard: { borderColor: "#D1D5DB", borderWidth: 1 },
  indicator: { width: 10, height: 10, borderRadius: 5, marginRight: 15 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  name: { fontSize: 17, fontWeight: "700", color: "#1F2937" },
  email: { fontSize: 13, color: "#9CA3AF" },
  statusText: { fontSize: 22, fontWeight: "600", marginTop: 2 },
  loadingText: { textAlign: "center", color: "#9CA3AF", marginTop: 20 },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginTop: 40 },
  emptyCard: { padding: 20, backgroundColor: "#E5E7EB", borderRadius: 12, alignItems: "center" }
});