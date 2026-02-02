import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
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
  hasNewUpdate?: boolean; // For animation
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
  errorLight: "#FEF2F2",
  errorBorder: "#FECACA",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  success: "#10B981",
  successLight: "#ECFDF5",
  background: "#FAFAFA",
  highlight: "red", // Red for highlighted time
  highlightLight: "#E0E7FF",
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

  // Track last checkin times to detect new updates
  const lastCheckinTimes = useRef<Map<string, string>>(new Map());

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
        const isNew = !lastCheckinTimes.current.has(user.id) ||
          lastCheckinTimes.current.get(user.id) !== data.last_checkin;

        lastCheckinTimes.current.set(user.id, data.last_checkin);

        setOwnerActivity({
          ...data,
          display_name: "Du",
          is_owner: true,
          hasNewUpdate: isNew,
        });
      } else {
        // User exists but hasn't checked in yet
        setOwnerActivity({
          user_id: user.id,
          display_name: "Du",
          last_checkin: null,
          priority: 0,
          is_owner: true,
          hasNewUpdate: false,
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

        // Check if this is a new check-in
        const isNew = !lastCheckinTimes.current.has(activity.user_id) ||
          lastCheckinTimes.current.get(activity.user_id) !== activity.last_checkin;

        if (activity.last_checkin) {
          lastCheckinTimes.current.set(activity.user_id, activity.last_checkin);
        }

        const finalDisplayName =
          contactInfo?.display_name || activity.display_name;
        const email = contactInfo?.email || null;

        return {
          ...activity,
          display_name: finalDisplayName,
          email,
          contact_display_name: contactInfo?.display_name,
          hasNewUpdate: isNew,
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
              lastCheckinTimes.current.delete(user.id);
              setOwnerActivity({
                user_id: user.id,
                display_name: "Du",
                last_checkin: null,
                priority: 0,
                is_owner: true,
                hasNewUpdate: false,
              });
              return;
            }

            if (payload.new) {
              const isNew = !lastCheckinTimes.current.has(user.id) ||
                lastCheckinTimes.current.get(user.id) !== payload.new.last_checkin;

              if (payload.new.last_checkin) {
                lastCheckinTimes.current.set(user.id, payload.new.last_checkin);
              }

              setOwnerActivity({
                user_id: payload.new.user_id,
                last_checkin: payload.new.last_checkin,
                priority: payload.new.priority,
                display_name: "Du",
                is_owner: true,
                hasNewUpdate: isNew,
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
            lastCheckinTimes.current.delete(payload.old.user_id);
            setActivities((prev) =>
              prev.filter((a) => a.user_id !== payload.old.user_id)
            );
            return;
          }

          // For INSERT/UPDATE - USE contactMapRef.current (not state)
          const contactInfo = contactMapRef.current.get(updated.user_id);

          // Check if this is a new check-in
          const isNew = !lastCheckinTimes.current.has(updated.user_id) ||
            lastCheckinTimes.current.get(updated.user_id) !== updated.last_checkin;

          if (updated.last_checkin) {
            lastCheckinTimes.current.set(updated.user_id, updated.last_checkin);
          }

          const enriched = {
            ...updated,
            display_name: contactInfo?.display_name || updated.display_name,
            email: contactInfo?.email || null,
            contact_display_name: contactInfo?.display_name,
            hasNewUpdate: isNew,
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

    // Clear previous check-in times
    lastCheckinTimes.current.clear();

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
      lastCheckinTimes.current.clear();
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
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
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Ionicons name="pulse" size={28} color="#5FA893" />
              <Text style={styles.title}>Aktivitet</Text>
            </View>
            <Text style={styles.subtitle}>
              Din och dina kontakters senaste check-ins
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="refresh" size={36} color="#9CA3AF" style={styles.loadingIcon} />
              <Text style={styles.loadingText}>Laddar aktiviteter...</Text>
            </View>
          ) : (
            <>
              {/* Owner's Activity Card */}
              {ownerActivity && (
                <View style={styles.ownerCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="person-circle" size={20} color="#5FA893" />
                    <Text style={styles.cardTitle}>Din aktivitet</Text>
                  </View>
                  <ActivityItem
                    name={ownerActivity.display_name}
                    timestamp={ownerActivity.last_checkin}
                    priority={ownerActivity.priority}
                    isOwner={true}
                    hasNewUpdate={ownerActivity.hasNewUpdate}
                    userId={ownerActivity.user_id}
                  />
                </View>
              )}

              {/* Contacts Activities Card */}
              <View style={styles.contactsCard}>
                <View style={styles.cardHeader}>
                  <Ionicons name="people" size={20} color="#5FA893" />
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
                      timestamp={item.last_checkin}
                      priority={item.priority}
                      isOwner={false}
                      hasNewUpdate={item.hasNewUpdate}
                      userId={item.user_id}
                      isLast={index === activities.length - 1}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="people-outline"
                      size={40}
                      color="#D1D5DB"
                    />
                    <Text style={styles.emptyTitle}>Inga kontakter</Text>
                    <Text style={styles.emptyText}>
                      Lägg till kontakter för att se deras aktiviteter
                    </Text>
                  </View>
                )}
              </View>

              {/* Bottom spacing */}
              <View style={styles.bottomSpacing} />
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
  hasNewUpdate = false,
  userId,
  isLast = false,
}: {
  name: string;
  email?: string | null;
  timestamp: string | null;
  priority: number;
  isOwner?: boolean;
  hasNewUpdate?: boolean;
  userId: string;
  isLast?: boolean;
}) {
  const timeScaleAnim = useRef(new Animated.Value(1)).current;
  const timeColorAnim = useRef(new Animated.Value(0)).current;

  // Animation for new updates
  useEffect(() => {
    if (hasNewUpdate && timestamp) {
      // Reset animations
      timeScaleAnim.setValue(1);
      timeColorAnim.setValue(0);

      // Step 1: Make time bigger and change color
      Animated.parallel([
        Animated.sequence([
          Animated.timing(timeScaleAnim, {
            toValue: 1.25, // Make time 40% bigger
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(timeScaleAnim, {
            toValue: 1.15, // Stay slightly bigger
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.spring(timeScaleAnim, {
            toValue: 1,
            friction: 5,
            tension: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(timeColorAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(timeColorAnim, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(timeColorAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      // Clear the new update flag after 2 seconds
      const timer = setTimeout(() => {
        // This would be handled by parent component
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [hasNewUpdate, timestamp]);

  const getPriorityInfo = () => {
    if (priority === 2) return {
      color: "#EF4444",
      icon: "alert-circle",
      label: "Misslyckad",
      bgColor: "#FEF2F2"
    };
    if (priority === 1) return {
      color: "#F59E0B",
      icon: "time",
      label: "Pågående",
      bgColor: "#FEF3C7"
    };
    return {
      color: "#10B981",
      icon: "checkmark-circle",
      label: "Lyckad",
      bgColor: "#ECFDF5"
    };
  };

  const priorityInfo = getPriorityInfo();

  let timeText = "";
  let dateText = "";

  if (timestamp) {
    const d = new Date(timestamp);
    timeText = d.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    dateText = d.toLocaleDateString("sv-SE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  const isRecent = timestamp && (Date.now() - new Date(timestamp).getTime() < 5 * 60 * 1000);

  // Interpolate color for time animation
  const timeColor = timeColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isRecent ? colors.highlight : colors.textDark, colors.highlight]
  });

  return (
    <View style={[styles.activityItem, !isLast && styles.activityItemBorder]}>
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          <View style={styles.nameContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.activityName} numberOfLines={1}>
                {name}
              </Text>
              {isOwner && (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Du</Text>
                </View>
              )}
            </View>
            {email && (
              <Text style={styles.activityEmail} numberOfLines={1}>
                {email}
              </Text>
            )}
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: priorityInfo.bgColor }]}>
            <Ionicons name={priorityInfo.icon as any} size={12} color={priorityInfo.color} />
            <Text style={[styles.priorityText, { color: priorityInfo.color }]}>
              {priorityInfo.label}
            </Text>
          </View>
        </View>

        <View style={styles.activityFooter}>
          {timestamp ? (
            <View style={styles.timeRow}>
              <View style={styles.timeContainer}>
                <Ionicons
                  name="time"
                  size={16}
                  color={isRecent ? colors.highlight : colors.textLight}
                />
                <Animated.Text
                  style={[
                    styles.timeText,
                    {
                      transform: [{ scale: timeScaleAnim }],
                      color: timeColor,
                    }
                  ]}
                >
                  {timeText}
                </Animated.Text>
              </View>
              <Text style={[
                styles.dateText,
                isRecent && styles.recentDateText
              ]}>
                {dateText}
              </Text>
              {isRecent && (
                <View style={[styles.recentBadge, { backgroundColor: colors.highlightLight }]}>
                  <Text style={[styles.recentBadgeText, { color: colors.highlight }]}>
                    Nyss
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noActivityContainer}>
              <Ionicons name="ellipsis-horizontal" size={14} color="#9CA3AF" />
              <Text style={styles.noActivityText}>Ingen aktivitet</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textDark,
    marginLeft: 10,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingIcon: {
    marginBottom: 10,
  },
  loadingText: {
    fontSize: 15,
    color: "#6B7280",
  },

  // Cards
  ownerCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  contactsCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textDark,
    marginLeft: 8,
  },
  contactCount: {
    marginLeft: 'auto',
    backgroundColor: "#EDF7F4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  contactCountText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5FA893",
  },

  // Activity Item
  activityItem: {
    paddingVertical: 10,
  },
  activityItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 2,
  },
  activityName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textDark,
  },
  ownerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#5FA893",
    borderRadius: 6,
    marginLeft: 6,
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  activityEmail: {
    fontSize: 13,
    color: "#6B7280",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  activityFooter: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 5,
  },
  dateText: {
    fontSize: 14,
    color: colors.textDark,
    marginLeft: 'auto',
    marginRight: 8,
  },
  recentDateText: {
    color: colors.highlight,
    fontWeight: "500",
  },
  recentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recentBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  noActivityContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  noActivityText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontStyle: "italic",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textDark,
    marginTop: 12,
    marginBottom: 6,
  },
  emptyText: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
  },

  // Bottom spacing
  bottomSpacing: {
    height: 20,
  },
});