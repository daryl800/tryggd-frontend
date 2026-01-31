import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Activity = {
  user_id: string;
  display_name: string;  // From user_latest_checkins
  last_checkin: string | null;
  priority: number;
  // Will be added after enrichment:
  email?: string | null;
  contact_display_name?: string; // From contacts table
};

export default function ActivitiesScreen() {
  const router = useRouter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactMap, setContactMap] = useState<Map<string, { email: string; display_name: string }>>(new Map());

  // Fetch current user's contacts for email/display_name mapping
  const fetchContacts = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data: contactsData } = await supabase
        .from("contacts")
        .select("contact_user_id, contact_email, contact_display_name")
        .eq("owner_user_id", user.id);

      if (contactsData) {
        const map = new Map<string, { email: string; display_name: string }>();
        contactsData.forEach(c => {
          map.set(c.contact_user_id, {
            email: c.contact_email || '',
            display_name: c.contact_display_name || ''
          });
        });
        setContactMap(map);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    }
  };

  // Enrich activities with contact info
  const enrichActivities = (activitiesData: any[]): Activity[] => {
    return activitiesData.map(activity => {
      const contactInfo = contactMap.get(activity.user_id);

      // Use contact display_name if available, otherwise use activity display_name
      const finalDisplayName = contactInfo?.display_name || activity.display_name;
      const email = contactInfo?.email || null;

      return {
        ...activity,
        display_name: finalDisplayName,
        email,
        contact_display_name: contactInfo?.display_name
      };
    });
  };

  // Format display with email
  const formatDisplayName = (activity: Activity): string => {
    if (activity.email && activity.email.trim() !== '') {
      return `${activity.display_name} (${activity.email})`;
    }
    return activity.display_name;
  };

  // Fetch all latest check-ins
  const fetchActivities = async () => {
    try {
      // First, get contacts for mapping
      await fetchContacts();

      // Then get activities
      const { data, error } = await supabase
        .from("user_latest_checkins")
        .select("*")
        .order("last_checkin", { ascending: false });

      if (error) throw error;

      // Enrich with contact info
      const enriched = enrichActivities(data || []);

      // Sort by priority descending, then last_checkin descending
      const sorted = enriched.sort((a, b) => {
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

          const updated: any = payload.new;

          // Handle delete
          if (payload.eventType === 'DELETE') {
            setActivities((prev) =>
              prev.filter((a) => a.user_id !== payload.old.user_id)
            );
            return;
          }

          // For INSERT/UPDATE, enrich with contact info
          const enriched = enrichActivities([updated])[0];

          setActivities((prev) => {
            const index = prev.findIndex((a) => a.user_id === enriched.user_id);
            const newArray = [...prev];

            if (index !== -1) {
              // Replace existing
              newArray[index] = enriched;
            } else {
              // Add new
              newArray.push(enriched);
            }

            // Re-sort
            return newArray.sort((a, b) => {
              if (b.priority !== a.priority) return b.priority - a.priority;
              return (b.last_checkin ?? "").localeCompare(a.last_checkin ?? "");
            });
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Also subscribe to contacts changes
  useEffect(() => {
    const contactsChannel = supabase
      .channel("contacts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts" },
        () => {
          // Refresh contacts and re-enrich activities
          fetchContacts().then(() => {
            setActivities(prev => enrichActivities(prev));
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(contactsChannel);
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

        {!loading && activities.length === 0 && (
          <Text style={{ textAlign: "center", color: "#6B7280", marginTop: 40 }}>
            Inga aktiviteter än. Lägg till kontakter för att se deras aktiviteter.
          </Text>
        )}

        {!loading &&
          activities.map((item) => (
            <ActivityItem
              key={item.user_id}
              name={formatDisplayName(item)}
              timestamp={item.last_checkin}
              priority={item.priority}
            />
          ))}
      </ScrollView>

    </SafeAreaView>
  );
}

// ActivityItem component remains the same
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
    <View style={{ flexDirection: "row", marginBottom: 20, alignItems: "flex-start" }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
          marginTop: 6,
          marginRight: 12,
          flexShrink: 0,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color, marginTop: 4 }}>{statusText}</Text>
      </View>
    </View>
  );
}