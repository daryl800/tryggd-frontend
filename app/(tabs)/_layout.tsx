// app/(tabs)/_layout.tsx
import { useContactStore } from "@/stores/contactStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { iosFontSize } from '@/constants/typography';
import { supabase } from "@/lib/supabase";

// Notification Badge Component
const NotificationBadge = ({ count }: { count: number }) => {
  if (count <= 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText} allowFontScaling={false}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
};

export default function TabsLayout() {
  const { user, initialized, loading, needsUsername } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const unreadCount = useContactStore((state) => state.unreadCount);
  const setUnreadCount = useContactStore((state) => state.setUnreadCount);
  const incrementUnread = useContactStore((state) => state.incrementUnread);

  const syncUnreadRequests = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const { data: requests } = await supabase
        .from('contact_requests')
        .select('id, created_at')
        .eq('receiver_user_id', user.id)
        .eq('status', 'pending')
        .gte(
          'created_at',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );

      const lastViewed = await AsyncStorage.getItem('last_viewed_requests');
      const count =
        requests?.filter((request) => {
          if (!lastViewed) return true;
          return new Date(request.created_at) > new Date(lastViewed);
        }).length || 0;

      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to sync unread contact requests:', error);
    }
  }, [setUnreadCount, user]);

  useEffect(() => {
    void syncUnreadRequests();
  }, [syncUnreadRequests]);

  useEffect(() => {
    if (!user) return;

    const requestsSubscription = supabase
      .channel(`tabs:contact_requests:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contact_requests',
          filter: `receiver_user_id=eq.${user.id}`,
        },
        () => {
          incrementUnread();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_requests',
          filter: `receiver_user_id=eq.${user.id}`,
        },
        () => {
          void syncUnreadRequests();
        }
      )
      .subscribe();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncUnreadRequests();
      }
    });

    return () => {
      requestsSubscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, [incrementUnread, syncUnreadRequests, user]);

  if (!initialized || loading) return null;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (needsUsername) return <Redirect href="/complete-profile" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          height: Platform.select({
            ios: 70,
            android: 60 + insets.bottom
          }),
          paddingBottom: Platform.select({
            ios: 20,
            android: Math.max(8, insets.bottom)
          }),
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: iosFontSize(10),
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarActiveTintColor: '#5FA893',
        tabBarAllowFontScaling: true,
      }}
    >
      {/* Home Tab */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("home.title"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          )
        }}
      />

      {/* Activity Tab */}
      <Tabs.Screen
        name="activity"
        options={{
          title: t("activity.title"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "pulse" : "pulse-outline"} color={color} size={size} />
          )
        }}
      />

      {/* Contacts Tab with Badge */}
      <Tabs.Screen
        name="contacts"
        options={{
          title: t("contacts.title"),
          tabBarIcon: ({ color, size, focused }) => (
            <View style={styles.tabIconContainer}>
              <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
              {unreadCount > 0 && (
                <NotificationBadge count={unreadCount} />
              )}
            </View>
          )
        }}
      />

      {/* Settings Tab */}
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings.title"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={size} />
          )
        }}
      />

      {/* Profile hidden from tabs but accessible via router */}
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="plus"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    position: 'relative',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    paddingHorizontal: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: iosFontSize(10),
    fontWeight: 'bold',
  },
});
