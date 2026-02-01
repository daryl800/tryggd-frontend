import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

// ==================== TYPES ====================

type Activity = {
  user_id: string;
  display_name: string;
  last_checkin: string | null;
  priority: number;
  email?: string | null;
  contact_display_name?: string;
  is_owner?: boolean;
};

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
  error: "#EF4444",
  errorLight: "#FEF3F2",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  success: "#22C55E",
  successLight: "#D1FAE5",
};

// ==================== MAIN COMPONENT ====================

export default function ActivityScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactMap, setContactMap] = useState<
    Map<string, { email: string; display_name: string }>
  >(new Map());

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Use refs to track state without causing re-renders
  const myContactIds = useRef<string[]>([]);
  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const ownerCheckinsChannelRef = useRef<any>(null);
  const isInitialized = useRef(false);
  const isFocused = useRef(false);

  // Use ref for contactMap to avoid closure issues
  const contactMapRef = useRef<
    Map<string, { email: string; display_name: string }>
  >(new Map());

  // ==================== ANIMATIONS ====================

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // ==================== DATA FETCHING ====================

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

      if (contactsData) {
        const map = new Map<string, { email: string; display_name: string }>();
        const ids: string[] = [];

        contactsData.forEach((c) => {
          map.set(c.contact_user_id, {
            email: c.contact_email || "",
            display_name: c.contact_display_name || "",
          });
          ids.push(c.contact_user_id);
        });

        // Update both state and ref
        setContactMap(map);
        contactMapRef.current = map;
        myContactIds.current = ids;

        return { ids, map };
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    }
    return { ids: [], map: new Map() };
  };

  // Fetch owner's own activity
  const fetchOwnerActivity = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("user_latest_checkins")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Failed to fetch owner activity:", error);
        return;
      }

      if (data) {
        setOwnerActivity({
          ...data,
          display_name: "Du",
          is_owner: true,
        });
      } else {
        // User exists but hasn't checked in yet
        setOwnerActivity({
          user_id: user.id,
          display_name: "Du",
          last_checkin: null,
          priority: 0,
          is_owner: true,
        });
      }
    } catch (err) {
      console.error("Failed to fetch owner activity:", err);
    }
  };

  // Fetch activities only for contacts
  const fetchActivities = async () => {
    try {
      // Get contacts AND the fresh map
      const { ids: contactIds, map: freshContactMap } = await fetchContacts();

      // Fetch owner's activity
      await fetchOwnerActivity();

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

      // Enrich with the FRESH contactMap
      const enriched = (data || []).map((activity) => {
        const contactInfo = freshContactMap.get(activity.user_id);

        const finalDisplayName =
          contactInfo?.display_name || activity.display_name;
        const email = contactInfo?.email || null;

        return {
          ...activity,
          display_name: finalDisplayName,
          email,
          contact_display_name: contactInfo?.display_name,
        };
      });

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
      setRefreshing(false);
    }
  };

  // ==================== REALTIME SUBSCRIPTIONS ====================

  // Setup owner's checkins subscription
  const setupOwnerCheckinsSubscription = () => {
    if (ownerCheckinsChannelRef.current) {
      supabase.removeChannel(ownerCheckinsChannelRef.current);
      ownerCheckinsChannelRef.current = null;
    }

    supabase.auth.getUser().then(({ data: userData }) => {
      const user = userData.user;
      if (!user) return;

      const channel = supabase
        .channel("owner-checkins-realtime")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_latest_checkins",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setOwnerActivity({
                user_id: user.id,
                display_name: "Du",
                last_checkin: null,
                priority: 0,
                is_owner: true,
              });
              return;
            }

            if (payload.new) {
              setOwnerActivity({
                ...payload.new,
                display_name: "Du",
                is_owner: true,
              });
            }
          }
        )
        .subscribe();

      ownerCheckinsChannelRef.current = channel;
    });
  };

  // Setup checkins subscription
  const setupCheckinsSubscription = () => {
    if (checkinsChannelRef.current) {
      supabase.removeChannel(checkinsChannelRef.current);
      checkinsChannelRef.current = null;
    }

    const contactIds = myContactIds.current;
    if (contactIds.length === 0) return;

    const channel = supabase
      .channel("latest-checkins-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_latest_checkins",
          filter: `user_id=in.(${contactIds.join(",")})`,
        },
        (payload) => {
          if (!payload.new) return;

          const updated: any = payload.new;

          // Handle delete
          if (payload.eventType === "DELETE") {
            setActivities((prev) =>
              prev.filter((a) => a.user_id !== payload.old.user_id)
            );
            return;
          }

          // For INSERT/UPDATE - USE contactMapRef.current (not state)
          const contactInfo = contactMapRef.current.get(updated.user_id);

          const enriched = {
            ...updated,
            display_name: contactInfo?.display_name || updated.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name,
          };

          setActivities((prev) => {
            const index = prev.findIndex((a) => a.user_id === enriched.user_id);
            const newArray = [...prev];

            if (index !== -1) {
              newArray[index] = enriched;
            } else {
              newArray.push(enriched);
            }

            // Re-sort
            return newArray.sort((a, b) => {
              if (b.priority !== a.priority) return b.priority - a.priority;
              return (b.last_checkin ?? "").localeCompare(
                a.last_checkin ?? ""
              );
            });
          });
        }
      )
      .subscribe();

    checkinsChannelRef.current = channel;
  };

  // Setup contacts subscription
  const setupContactsSubscription = () => {
    if (contactsChannelRef.current) {
      supabase.removeChannel(contactsChannelRef.current);
      contactsChannelRef.current = null;
    }

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
            filter: `owner_user_id=eq.${user.id}`,
          },
          async () => {
            // Refresh contacts and activities
            await fetchContacts();

            // Update checkins subscription with new contact list
            setupCheckinsSubscription();

            // Refetch activities
            fetchActivities();
          }
        )
        .subscribe();

      contactsChannelRef.current = channel;
    });
  };

  // ==================== INITIALIZATION ====================

  const initialize = async (force = false) => {
    if (isInitialized.current && !force) {
      return;
    }

    isInitialized.current = true;

    // Fetch data first
    await fetchActivities();

    // Then setup subscriptions
    setupContactsSubscription();
    setupCheckinsSubscription();
    setupOwnerCheckinsSubscription();
  };

  // Manual refresh function
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActivities();
  };

  // Handle screen focus
  const handleScreenFocus = useCallback(() => {
    isFocused.current = true;

    if (isInitialized.current) {
      fetchActivities();
    } else {
      initialize();
    }
  }, []);

  // Handle screen blur
  const handleScreenBlur = useCallback(() => {
    isFocused.current = false;
  }, []);

  // Use focus effect to handle screen visibility
  useFocusEffect(
    useCallback(() => {
      handleScreenFocus();
      return () => handleScreenBlur();
    }, [handleScreenFocus, handleScreenBlur])
  );

  // Main useEffect - runs only on mount
  useEffect(() => {
    initialize();

    // Cleanup on unmount
    return () => {
      if (checkinsChannelRef.current) {
        supabase.removeChannel(checkinsChannelRef.current);
        checkinsChannelRef.current = null;
      }
      if (contactsChannelRef.current) {
        supabase.removeChannel(contactsChannelRef.current);
        contactsChannelRef.current = null;
      }
      if (ownerCheckinsChannelRef.current) {
        supabase.removeChannel(ownerCheckinsChannelRef.current);
        ownerCheckinsChannelRef.current = null;
      }
      isInitialized.current = false;
    };
  }, []);

  // Re-enrich activities when contactMap changes
  useEffect(() => {
    if (activities.length > 0 && contactMap.size > 0) {
      const needsUpdate = activities.some((activity) => {
        const contactInfo = contactMap.get(activity.user_id);
        const shouldHaveEmail = contactInfo?.email || null;
        return activity.email !== shouldHaveEmail;
      });

      if (needsUpdate) {
        const reEnriched = activities.map((activity) => {
          const contactInfo = contactMap.get(activity.user_id);
          return {
            ...activity,
            display_name: contactInfo?.display_name || activity.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name,
          };
        });
        setActivities(reEnriched);
      }
    }
  }, [contactMap]);

  // ==================== RENDER ====================

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {/* Header */}
          <Text style={styles.title}>Aktivitet</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Laddar...</Text>
            </View>
          ) : (
            <>
              {/* Owner's Activity */}
              {ownerActivity && (
                <View style={styles.ownerSection}>
                  <ActivityItem
                    name={ownerActivity.display_name}
                    timestamp={ownerActivity.last_checkin}
                    priority={ownerActivity.priority}
                    isOwner={true}
                  />
                </View>
              )}

              {/* Divider */}
              {ownerActivity && activities.length > 0 && (
                <View style={styles.divider} />
              )}

              {/* Contacts Activities */}
              {activities.length > 0 ? (
                activities.map((item) => (
                  <ActivityItem
                    key={item.user_id}
                    name={item.display_name}
                    email={item.email}
                    timestamp={item.last_checkin}
                    priority={item.priority}
                    isOwner={false}
                  />
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="people-outline"
                    size={48}
                    color={colors.textLight}
                  />
                  <Text style={styles.emptyText}>
                    Inga aktiviteter än. Lägg till kontakter för att se deras
                    aktiviteter.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ==================== ACTIVITY ITEM COMPONENT ====================

function ActivityItem({
  name,
  email,
  timestamp,
  priority,
  isOwner = false,
}: {
  name: string;
  email?: string | null;
  timestamp: string | null;
  priority: number;
  isOwner?: boolean;
}) {
  const getPriorityColor = () => {
    if (priority === 2) return colors.error;
    if (priority === 1) return colors.warning;
    return colors.success;
  };

  const color = getPriorityColor();

  let statusText = "Ingen aktivitet ännu";

  if (timestamp) {
    const d = new Date(timestamp);
    const dateStr = d.toLocaleDateString("sv-SE", {
      month: "short",
      day: "numeric",
    });
    const timeStr = d.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    statusText = `Senast bekräftat ${dateStr} ${timeStr}`;
  }

  return (
    <View style={[styles.activityItem, isOwner && styles.ownerItem]}>
      <View style={styles.activityRow}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <View style={styles.activityContent}>
          <View style={styles.nameRow}>
            <Text style={styles.activityName} numberOfLines={1}>
              {name}
            </Text>
            {isOwner && (
              <View style={styles.ownerBadge}>
                <Text style={styles.ownerBadgeText}>Du</Text>
              </View>
            )}
            {email && (
              <Text style={styles.activityEmail} numberOfLines={1}>
                {` (${email})`}
              </Text>
            )}
          </View>
          <Text style={[styles.activityStatus, { color }]}>{statusText}</Text>
        </View>
      </View>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 0,
  },
  scrollView: {
    flex: 1,
  },

  // Header
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 24,
  },

  // Loading
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: colors.textMuted,
  },

  // Owner Section
  ownerSection: {
    marginBottom: 8,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 20,
  },

  // Activity Item
  activityItem: {
    marginBottom: 20,
  },
  ownerItem: {
    backgroundColor: colors.primaryLight,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 6,
    marginRight: 12,
    flexShrink: 0,
  },
  activityContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  activityName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textDark,
  },
  ownerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  ownerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.surface,
  },
  activityEmail: {
    fontSize: 13,
    color: colors.textMuted,
  },
  activityStatus: {
    fontSize: 16,
    marginTop: 4,
    fontWeight: "500",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
  },
});
