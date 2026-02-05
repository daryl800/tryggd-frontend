// app/(tabs)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // Add this import
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

// Notification Badge Component
const NotificationBadge = ({ count }: { count: number }) => {
  if (count <= 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
};

export default function TabsLayout() {
  const { user, initialized } = useAuth();
  const [unreadRequests, setUnreadRequests] = useState(0);
  const { t } = useTranslation(); // Initialize translation hook

  // Fetch unread contact requests
  useEffect(() => {
    const fetchUnreadRequests = async () => {
      if (!user) return;

      try {
        const { data: requests } = await supabase
          .from("contact_requests")
          .select("id, created_at")
          .eq("receiver_user_id", user.id)
          .eq("status", "pending");

        // Check last viewed time
        const lastViewed = await AsyncStorage.getItem('last_viewed_requests');
        const unreadCount = requests?.filter(request => {
          if (!lastViewed) return true;
          return new Date(request.created_at) > new Date(lastViewed);
        }).length || 0;

        setUnreadRequests(unreadCount);
      } catch (error) {
        console.error("Error fetching unread requests:", error);
      }
    };

    if (user) {
      fetchUnreadRequests();

      // Subscribe to real-time updates
      const subscription = supabase
        .channel(`contact_requests_badge:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'contact_requests',
            filter: `receiver_user_id=eq.${user.id}`,
          },
          () => {
            fetchUnreadRequests();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  if (!initialized) return null;
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#ffffff' },
      tabBarActiveTintColor: '#5FA893',
    }}>
      {/* Home Tab */}
      <Tabs.Screen name="index" options={{
        title: t("home.title"), // Translate using the correct key
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
        )
      }} />

      {/* Activity Tab */}
      <Tabs.Screen name="activity" options={{
        title: t("activity.title"), // Translate using the correct key
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? "pulse" : "pulse-outline"} color={color} size={size} />
        )
      }} />

      {/* Contacts Tab with Badge */}
      <Tabs.Screen name="contacts" options={{
        title: t("contacts.title"), // Translate using the correct key
        tabBarIcon: ({ color, size, focused }) => (
          <View style={styles.tabIconContainer}>
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
            {unreadRequests > 0 && (
              <NotificationBadge count={unreadRequests} />
            )}
          </View>
        )
      }} />

      {/* Profile Tab */}
      <Tabs.Screen name="profile" options={{
        title: t("profile.title"), // Translate using the correct key
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? "person" : "person-outline"} color={color} size={size} />
        )
      }} />

      {/* Settings hidden from tabs but accessible via router */}
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});