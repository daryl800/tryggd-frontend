import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type Activity = {
  user_id: string;
  display_name: string;
  last_checkin: string | null;
  priority: number;
  email?: string | null;
  contact_display_name?: string;
};

export default function ActivitiesScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactMap, setContactMap] = useState<Map<string, { email: string; display_name: string }>>(new Map());

  // Use refs to track state without causing re-renders
  const myContactIds = useRef<string[]>([]);
  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const isInitialized = useRef(false);

  // Fetch current user's contacts for email/display_name mapping
  const fetchContacts = async (): Promise<{
    ids: string[];
    map: Map<string, { email: string; display_name: string }>;
  }> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return { ids: [], map: new Map() };

      const { data: contactsData } = await supabase
        .from("contacts")
        .select("contact_user_id, contact_email, contact_display_name")
        .eq("owner_user_id", user.id);

      console.log('Fetched contacts data:', contactsData);

      if (contactsData) {
        const map = new Map<string, { email: string; display_name: string }>();
        const ids: string[] = [];

        contactsData.forEach(c => {
          map.set(c.contact_user_id, {
            email: c.contact_email || '',
            display_name: c.contact_display_name || ''
          });
          ids.push(c.contact_user_id);
        });

        setContactMap(map);
        myContactIds.current = ids;

        console.log('Returning map with entries:', Array.from(map.entries()));
        return { ids, map };
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    }
    return { ids: [], map: new Map() };
  };

  // Fetch activities only for contacts
  const fetchActivities = async () => {
    try {
      // Get contacts AND the fresh map
      const { ids: contactIds, map: freshContactMap } = await fetchContacts();

      console.log('Fresh contactMap:', Array.from(freshContactMap.entries()));

      if (contactIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      // Then get activities ONLY for contacts
      const { data, error } = await supabase
        .from("user_latest_checkins")
        .select("*")
        .in("user_id", contactIds)
        .order("last_checkin", { ascending: false });

      if (error) throw error;

      console.log('Raw checkins data:', data);

      // Enrich with the FRESH contactMap (not the stale one from closure)
      const enriched = (data || []).map(activity => {
        const contactInfo = freshContactMap.get(activity.user_id);

        console.log('Enriching user:', activity.user_id, 'Contact info:', contactInfo);

        const finalDisplayName = contactInfo?.display_name || activity.display_name;
        const email = contactInfo?.email || null;

        return {
          ...activity,
          display_name: finalDisplayName,
          email,
          contact_display_name: contactInfo?.display_name
        };
      });

      console.log('Enriched activities:', enriched.map(a => ({
        name: a.display_name,
        email: a.email,
        userId: a.user_id
      })));

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

  // Setup checkins subscription (FIXED: Only subscribe once)
  const setupCheckinsSubscription = () => {
    // Clean up existing subscription
    if (checkinsChannelRef.current) {
      supabase.removeChannel(checkinsChannelRef.current);
      checkinsChannelRef.current = null;
    }

    const contactIds = myContactIds.current;
    if (contactIds.length === 0) return;

    console.log('Setting up checkins subscription for', contactIds.length, 'contacts');

    const channel = supabase
      .channel("latest-checkins-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_latest_checkins",
          filter: `user_id=in.(${contactIds.join(',')})`
        },
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

          // For INSERT/UPDATE, enrich with contact info from current contactMap
          const contactInfo = contactMap.get(updated.user_id);
          const enriched = {
            ...updated,
            display_name: contactInfo?.display_name || updated.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name
          };

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
      .subscribe((status) => {
        console.log('Checkins subscription status:', status);
      });

    checkinsChannelRef.current = channel;
  };

  // Setup contacts subscription (FIXED: Only subscribe once)
  const setupContactsSubscription = () => {
    // Clean up existing subscription
    if (contactsChannelRef.current) {
      supabase.removeChannel(contactsChannelRef.current);
      contactsChannelRef.current = null;
    }

    console.log('Setting up contacts subscription');

    supabase.auth.getUser().then(({ data: userData }) => {
      const user = userData.user;
      if (!user) return;

      const channel = supabase
        .channel("contacts-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contacts",
            filter: `owner_user_id=eq.${user.id}`
          },
          () => {
            console.log('Contacts changed, refreshing...');

            // Refresh contacts and activities
            fetchContacts().then(() => {
              // Update checkins subscription with new contact list
              setupCheckinsSubscription();

              // Refetch activities to get updated emails
              fetchActivities();
            });
          }
        )
        .subscribe((status) => {
          console.log('Contacts subscription status:', status);
        });

      contactsChannelRef.current = channel;
    });
  };

  // Initialize everything (FIXED: Run only once)
  const initialize = async () => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    console.log('Initializing...');

    // Fetch data first
    await fetchActivities();

    // Then setup subscriptions
    setupContactsSubscription();
    setupCheckinsSubscription();
  };

  // Re-enrich activities when contactMap changes
  useEffect(() => {
    if (activities.length > 0 && contactMap.size > 0) {
      console.log('ContactMap updated, checking if re-enrichment needed');

      const needsUpdate = activities.some(activity => {
        const contactInfo = contactMap.get(activity.user_id);
        const shouldHaveEmail = contactInfo?.email || null;
        return activity.email !== shouldHaveEmail;
      });

      if (needsUpdate) {
        console.log('Re-enriching activities with updated contactMap');
        const reEnriched = activities.map(activity => {
          const contactInfo = contactMap.get(activity.user_id);
          return {
            ...activity,
            display_name: contactInfo?.display_name || activity.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name
          };
        });
        setActivities(reEnriched);
      }
    }
  }, [contactMap]);

  // Main useEffect - RUNS ONLY ONCE
  useEffect(() => {
    initialize();

    // Cleanup on unmount
    return () => {
      if (checkinsChannelRef.current) {
        supabase.removeChannel(checkinsChannelRef.current);
      }
      if (contactsChannelRef.current) {
        supabase.removeChannel(contactsChannelRef.current);
      }
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
          activities.map((item) => {
            console.log('Rendering item:', {
              id: item.user_id,
              name: item.display_name,
              email: item.email,
              hasEmail: !!item.email
            });

            return (
              <ActivityItem
                key={item.user_id}
                name={item.display_name}
                email={item.email}
                timestamp={item.last_checkin}
                priority={item.priority}
              />
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}

// ActivityItem component
function ActivityItem({
  name,
  email,
  timestamp,
  priority,
}: {
  name: string;
  email?: string | null;
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

  console.log('ActivityItem rendering:', { name, email });

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
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }} numberOfLines={1}>
            {name}
          </Text>
          {email ? (
            <Text style={{ fontSize: 18, color: "#6B7280" }}>
              {` (${email})`}
            </Text>
          ) : null}
        </View>
        <Text style={{ color, marginTop: 4 }}>{statusText}</Text>
      </View>
    </View>
  );
}