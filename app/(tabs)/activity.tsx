import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

// ==================== TYPES ====================

type Activity = {
  user_id: string;
  display_name: string;
  last_checked_in_utc: string | null;
  priority: number;
  email?: string | null;
  contact_display_name?: string;
  is_owner?: boolean;
  hasNewUpdate?: boolean;
  checkin_timezone?: string | null;
};

// ==================== COLORS ====================

const colors = {
  primary: "#5FA893",
  primaryLight: "#F0F9F6",
  textDark: "#1F2937",
  textLight: "#9CA3AF",
  background: "#FAFAFA",
  highlight: "#EF4444", // Red color for updates
  highlightLight: "#E0E7FF",
};

// ==================== MAIN COMPONENT ====================

export default function ActivityScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [ownerActivity, setOwnerActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactMap, setContactMap] = useState<Map<string, { email: string; display_name: string }>>(new Map());

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastCheckinTimes = useRef<Map<string, string>>(new Map());
  const myContactIds = useRef<string[]>([]);
  const checkinsChannelRef = useRef<any>(null);
  const contactsChannelRef = useRef<any>(null);
  const ownerCheckinsChannelRef = useRef<any>(null);
  const isInitialized = useRef(false);
  const isFocused = useRef(false);
  const contactMapRef = useRef<Map<string, { email: string; display_name: string }>>(new Map());

  // ==================== ANIMATION ====================
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // ==================== DATA FETCHING ====================

  const fetchContacts = async (): Promise<{ ids: string[]; map: Map<string, { email: string; display_name: string }> }> => {
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

  const fetchOwnerActivity = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("users_latest_checkin")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Failed to fetch owner activity:", error);
        return;
      }

      if (data) {
        const isNew = !lastCheckinTimes.current.has(user.id) ||
          lastCheckinTimes.current.get(user.id) !== data.last_checked_in_utc;

        lastCheckinTimes.current.set(user.id, data.last_checked_in_utc);

        setOwnerActivity({
          ...data,
          display_name: "Du",
          is_owner: true,
          hasNewUpdate: isNew,
          checkin_timezone: data.checkin_timezone,
        });
      } else {
        setOwnerActivity({
          user_id: user.id,
          display_name: "Du",
          last_checked_in_utc: null,
          priority: 0,
          is_owner: true,
          hasNewUpdate: false,
          checkin_timezone: null,
        });
      }
    } catch (err) {
      console.error("Failed to fetch owner activity:", err);
    }
  };

  const fetchActivities = async () => {
    try {
      const { ids: contactIds, map: freshContactMap } = await fetchContacts();
      await fetchOwnerActivity();

      if (contactIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("users_latest_checkin")
        .select("*")
        .in("user_id", contactIds)
        .order("last_checked_in_utc", { ascending: false });

      if (error) throw error;

      const enriched = (data || []).map((activity) => {
        const contactInfo = freshContactMap.get(activity.user_id);

        const isNew = !lastCheckinTimes.current.has(activity.user_id) ||
          lastCheckinTimes.current.get(activity.user_id) !== activity.last_checked_in_utc;

        if (activity.last_checked_in_utc) {
          lastCheckinTimes.current.set(activity.user_id, activity.last_checked_in_utc);
        }

        return {
          ...activity,
          display_name: contactInfo?.display_name || activity.display_name,
          email: contactInfo?.email || null,
          contact_display_name: contactInfo?.display_name,
          hasNewUpdate: isNew,
          checkin_timezone: activity.checkin_timezone,
        };
      });

      const sorted = enriched.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (b.last_checked_in_utc ?? "").localeCompare(a.last_checked_in_utc ?? "");
      });

      setActivities(sorted);
    } catch (err) {
      console.error("Failed to load activities:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ==================== REALTIME ====================

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
            table: "users_latest_checkin",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              lastCheckinTimes.current.delete(user.id);
              setOwnerActivity({
                user_id: user.id,
                display_name: "Du",
                last_checked_in_utc: null,
                priority: 0,
                is_owner: true,
                hasNewUpdate: false,
                checkin_timezone: null,
              });
              return;
            }

            if (payload.new) {
              const isNew = !lastCheckinTimes.current.has(user.id) ||
                lastCheckinTimes.current.get(user.id) !== payload.new.last_checked_in_utc;

              if (payload.new.last_checked_in_utc) {
                lastCheckinTimes.current.set(user.id, payload.new.last_checked_in_utc);
              }

              setOwnerActivity({
                user_id: payload.new.user_id,
                last_checked_in_utc: payload.new.last_checked_in_utc,
                priority: payload.new.priority,
                display_name: "Du",
                is_owner: true,
                hasNewUpdate: isNew,
                checkin_timezone: payload.new.checkin_timezone,
              });
            }
          }
        )
        .subscribe();

      ownerCheckinsChannelRef.current = channel;
    });
  };

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
          table: "users_latest_checkin",
          filter: `user_id=in.(${contactIds.join(",")})`,
        },
        (payload) => {
          if (!payload.new) return;

          const updated: any = payload.new;

          if (payload.eventType === "DELETE") {
            lastCheckinTimes.current.delete(payload.old.user_id);
            setActivities((prev) => prev.filter((a) => a.user_id !== payload.old.user_id));
            return;
          }

          const contactInfo = contactMapRef.current.get(updated.user_id);

          const isNew = !lastCheckinTimes.current.has(updated.user_id) ||
            lastCheckinTimes.current.get(updated.user_id) !== updated.last_checked_in_utc;

          if (updated.last_checked_in_utc) {
            lastCheckinTimes.current.set(updated.user_id, updated.last_checked_in_utc);
          }

          const enriched = {
            ...updated,
            display_name: contactInfo?.display_name || updated.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name,
            hasNewUpdate: isNew,
            checkin_timezone: updated.checkin_timezone,
          };

          setActivities((prev) => {
            const index = prev.findIndex((a) => a.user_id === enriched.user_id);
            const newArray = [...prev];

            if (index !== -1) {
              newArray[index] = enriched;
            } else {
              newArray.push(enriched);
            }

            return newArray.sort((a, b) => {
              if (b.priority !== a.priority) return b.priority - a.priority;
              return (b.last_checked_in_utc ?? "").localeCompare(a.last_checked_in_utc ?? "");
            });
          });
        }
      )
      .subscribe();

    checkinsChannelRef.current = channel;
  };

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
            await fetchContacts();
            setupCheckinsSubscription();
            fetchActivities();
          }
        )
        .subscribe();

      contactsChannelRef.current = channel;
    });
  };

  const initialize = async (force = false) => {
    if (isInitialized.current && !force) return;
    isInitialized.current = true;

    lastCheckinTimes.current.clear();
    await fetchActivities();
    setupContactsSubscription();
    setupCheckinsSubscription();
    setupOwnerCheckinsSubscription();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActivities();
  };

  const handleScreenFocus = useCallback(() => {
    isFocused.current = true;
    if (isInitialized.current) fetchActivities();
    else initialize();
  }, []);

  const handleScreenBlur = useCallback(() => {
    isFocused.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      handleScreenFocus();
      return () => handleScreenBlur();
    }, [handleScreenFocus, handleScreenBlur])
  );

  useEffect(() => {
    initialize();
    return () => {
      if (checkinsChannelRef.current) supabase.removeChannel(checkinsChannelRef.current);
      if (contactsChannelRef.current) supabase.removeChannel(contactsChannelRef.current);
      if (ownerCheckinsChannelRef.current) supabase.removeChannel(ownerCheckinsChannelRef.current);
      isInitialized.current = false;
      lastCheckinTimes.current.clear();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Ionicons name="pulse" size={28} color={colors.primary} />
              <Text style={styles.title}>Aktivitet</Text>
            </View>
            <Text style={styles.subtitle}>Din och dina kontakters senaste check-ins</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="refresh" size={36} color={colors.textLight} style={styles.loadingIcon} />
              <Text style={styles.loadingText}>Laddar aktiviteter...</Text>
            </View>
          ) : (
            <>
              {/* Owner */}
              {ownerActivity && (
                <View style={styles.ownerCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="person-circle" size={20} color={colors.primary} />
                    <Text style={styles.cardTitle}>Din aktivitet</Text>
                  </View>
                  <ActivityItem
                    name={ownerActivity.display_name}
                    timestamp={ownerActivity.last_checked_in_utc}
                    priority={ownerActivity.priority}
                    isOwner
                    hasNewUpdate={ownerActivity.hasNewUpdate}
                    userId={ownerActivity.user_id}
                    checkin_timezone={ownerActivity.checkin_timezone}
                  />
                </View>
              )}

              {/* Contacts */}
              <View style={styles.contactsCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={20} color={colors.primary} />
                  <Text style={styles.cardTitle}>Kontakter</Text>
                  {activities.length > 0 && (
                    <View style={styles.contactCount}>
                      <Text style={styles.contactCountText}>{activities.length}</Text>
                    </View>
                  )}
                </View>

                {activities.length > 0 ? (
                  activities.map((item, index) => (
                    <ActivityItem
                      key={item.user_id}
                      name={item.display_name}
                      email={item.email}
                      timestamp={item.last_checked_in_utc}
                      priority={item.priority}
                      isOwner={false}
                      hasNewUpdate={item.hasNewUpdate}
                      userId={item.user_id}
                      checkin_timezone={item.checkin_timezone}
                      isLast={index === activities.length - 1}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="people-outline" size={40} color="#D1D5DB" />
                    <Text style={styles.emptyTitle}>Inga kontakter</Text>
                    <Text style={styles.emptyText}>Lägg till kontakter för att se deras aktiviteter</Text>
                  </View>
                )}
              </View>

              <View style={styles.bottomSpacing} />
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ==================== ACTIVITY ITEM ====================

// ==================== ACTIVITY ITEM ====================

function ActivityItem({
  name,
  email,
  timestamp,
  priority,
  isOwner = false,
  hasNewUpdate = false,
  userId,
  isLast = false,
  checkin_timezone,
}: {
  name: string;
  email?: string | null;
  timestamp: string | null;
  priority: number;
  isOwner?: boolean;
  hasNewUpdate?: boolean;
  userId: string;
  isLast?: boolean;
  checkin_timezone?: string | null;
}) {
  const timeScaleAnim = useRef(new Animated.Value(1)).current;
  const timeColorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hasNewUpdate && timestamp) {
      timeScaleAnim.setValue(1);
      timeColorAnim.setValue(0);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(timeScaleAnim, { toValue: 1.25, duration: 200, useNativeDriver: true }),
          Animated.timing(timeScaleAnim, { toValue: 1.15, duration: 1800, useNativeDriver: true }),
          Animated.spring(timeScaleAnim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(timeColorAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(1800),
          Animated.timing(timeColorAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [hasNewUpdate, timestamp]);

  // ======= TIME FORMATTING =======
  let timeText = "";
  let dateText = "";
  let timezoneText = "";

  // Check if we have a valid timestamp
  const isValidTimestamp = timestamp && !isNaN(new Date(timestamp).getTime());

  if (isValidTimestamp) {
    try {
      const d = new Date(timestamp);

      // Use the provided timezone or default to UTC
      const timezone = checkin_timezone || "UTC";

      // Format time (HH:mm)
      timeText = d.toLocaleTimeString("sv-SE", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone
      });

      // Format weekday (short)
      const weekday = d.toLocaleDateString("sv-SE", {
        weekday: "short",
        timeZone: timezone
      }).replace('.', ''); // Remove dot if present

      // Format day of month
      const dayOfMonth = d.getDate();

      // Format month name (full)
      const monthName = d.toLocaleDateString("sv-SE", {
        month: "long",
        timeZone: timezone
      });

      // Combine: weekday + day + month
      dateText = `${weekday} ${dayOfMonth} ${monthName}`;

      // Extract city name from timezone (e.g., "Europe/Stockholm" -> "Stockholm")
      const parts = timezone.split('/');
      timezoneText = parts.length > 1 ? parts[parts.length - 1] : timezone;

    } catch (error) {
      console.error("Error formatting time:", error);
      // Fallback without timezone
      const d = new Date(timestamp);
      timeText = d.toLocaleTimeString("sv-SE", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit"
      });

      const weekday = d.toLocaleDateString("sv-SE", { weekday: "short" }).replace('.', '');
      const dayOfMonth = d.getDate();
      const monthName = d.toLocaleDateString("sv-SE", { month: "long" });
      dateText = `${weekday} ${dayOfMonth} ${monthName}`;
      timezoneText = checkin_timezone || "UTC";
    }
  }

  const getPriorityInfo = () => {
    if (priority === 2) return { color: "#EF4444", icon: "alert-circle", label: "Misslyckad", bgColor: "#FEF2F2" };
    if (priority === 1) return { color: "#F59E0B", icon: "time", label: "Pågående", bgColor: "#FEF3C7" };
    return { color: "#10B981", icon: "checkmark-circle", label: "Lyckad", bgColor: "#ECFDF5" };
  };
  const priorityInfo = getPriorityInfo();

  return (
    <View style={[styles.activityItem, isLast && { marginBottom: 0, borderBottomWidth: 0 }]}>
      <View style={styles.activityRow}>
        {/* Left icon */}
        <Ionicons
          name={isOwner ? "person-circle" : "person"}
          size={28}
          color={colors.primary}
          style={{ marginRight: 12 }}
        />

        {/* Main content */}
        <View style={{ flex: 1 }}>
          {/* Name and Email row */}
          <View style={styles.nameEmailRow}>
            <Text style={styles.activityName}>{name}</Text>
            {email && (
              <Text style={styles.activityEmail} numberOfLines={1} ellipsizeMode="tail">
                {email}
              </Text>
            )}
          </View>

          {/* Time row with timezone and date on right */}
          {isValidTimestamp ? (
            <View style={styles.timeRow}>
              <View style={styles.timeDot} />
              <Animated.Text
                style={[
                  styles.activityTime,
                  {
                    color: timeColorAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [colors.textDark, colors.highlight]
                    })
                  },
                  hasNewUpdate && {
                    transform: [{ scale: timeScaleAnim }],
                  }
                ]}
              >
                {timeText} ({timezoneText})
              </Animated.Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.activityDate}>{dateText}</Text>
            </View>
          ) : (
            <View style={styles.timeRow}>
              <View style={styles.timeDot} />
              <Text style={[styles.activityTime, { color: colors.textLight }]}>
                Ingen check-in ännu
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Priority badge */}
      <View style={[styles.priorityBadge, { backgroundColor: priorityInfo.bgColor }]}>
        <Ionicons name={priorityInfo.icon as any} size={14} color={priorityInfo.color} />
        <Text style={[styles.priorityLabel, { color: priorityInfo.color }]}>{priorityInfo.label}</Text>
      </View>
    </View>
  );
}


// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "600", marginLeft: 8, color: colors.textDark },
  subtitle: { fontSize: 14, color: colors.textLight, marginLeft: 28 },
  loadingContainer: { justifyContent: "center", alignItems: "center", padding: 40 },
  loadingIcon: { marginBottom: 12 },
  loadingText: { color: colors.textLight },
  ownerCard: {
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2
  },
  contactsCard: {
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 2
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6"
  },
  cardTitle: {
    fontWeight: "600",
    fontSize: 16,
    marginLeft: 6,
    flex: 1,
    color: colors.textDark
  },
  contactCount: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center'
  },
  contactCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary
  },
  bottomSpacing: { height: 80 },
  emptyState: {
    justifyContent: "center",
    alignItems: "center",
    padding: 40
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: colors.textDark,
    marginTop: 12
  },
  emptyText: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 4,
    textAlign: 'center'
  },

  // ==================== STYLES: activityItem ====================

  activityItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6"
  },
  activityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8
  },
  nameEmailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textDark,
    flex: 1,
    marginRight: 8
  },
  activityEmail: {
    fontSize: 12,
    color: "#9CA3AF",
    flexShrink: 1,
    maxWidth: '40%'
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginRight: 8
  },
  activityTime: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textDark,
  },
  activityDate: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textLight,
    marginLeft: 'auto' // Push to rightmost
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginTop: 8
  },
  priorityLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
});