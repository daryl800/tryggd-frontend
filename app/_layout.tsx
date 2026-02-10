// app/_layout.tsx
import Constants from 'expo-constants';
import * as Linking from "expo-linking";
import { Slot, useRouter } from "expo-router";
import React, { useEffect, useRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import '../i18n';
import i18n from '../i18n';

// ✅ Check if we're in Expo Go
const IS_EXPO_GO = Constants.appOwnership === 'expo';

function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const router = useRouter();
  const notificationResponseListener = useRef<any>(null);
  const urlListenerRef = useRef<any>(null);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;

      const parsed = Linking.parse(url);

      // Email confirmation
      if (parsed.path === "auth/callback") {
        alert("Email confirmed. Please login.");
        router.replace("/(auth)/login");
        return;
      }

      // Password reset
      if (parsed.queryParams?.type === "recovery" && parsed.queryParams.access_token) {
        const token = parsed.queryParams.access_token;
        router.replace(`/(auth)/reset-password?access_token=${token}`);
        return;
      }
    };

    // App opened from background/closed
    Linking.getInitialURL().then(handleUrl);

    // App already open
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Setup push notifications for development builds
  useEffect(() => {
    const setupPushNotifications = async () => {
      // ✅ Skip in Expo Go
      if (!user || IS_EXPO_GO) {
        console.log('📱 Expo Go: Skipping push notification setup');
        return;
      }

      try {
        // ✅ Use regular import instead of dynamic import
        const { registerForPushNotificationsAsync, savePushToken } = await import('../lib/notifications/core');

        const token = await registerForPushNotificationsAsync();
        if (token) {
          await savePushToken(user.id, token);
          console.log('✅ Push token saved for user:', user.id);
        }
      } catch (error) {
        console.error('⚠️ Error setting up push notifications:', error);
        // Don't crash the app - this is expected in some environments
      }
    };

    // Handle notification taps (for development builds)
    const setupNotificationResponse = async () => {
      // ✅ Skip in Expo Go
      if (IS_EXPO_GO) {
        console.log('📱 Expo Go: Skipping notification response handler');
        return;
      }

      try {
        // ✅ Try to import, but don't crash if it fails
        const Notifications = await import('expo-notifications');

        // Configure notification presentation
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });

        // Add listener for notification taps
        notificationResponseListener.current =
          Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            console.log('👆 Notification tapped:', data?.type);

            // Handle different notification types
            if (data?.type === 'contact_request') {
              router.push('/(tabs)/contacts?tab=requests');
            } else if (data?.type === 'contact_accepted') {
              router.push('/(tabs)/contacts?tab=contacts');
            } else if (data?.type === 'contact_checkin') {
              router.push('/(tabs)/activity');
            } else if (data?.type === 'self_reminder' || data?.type === 'target_reminder') {
              router.push('/(tabs)/checkin');
            }
          });

        console.log('✅ Notification response handler setup complete');
      } catch (error) {
        console.log('ℹ️ Notification response handler not available:', error.message);
        // This is expected in some environments like Expo Go
      }
    };

    if (user) {
      setupPushNotifications();
      setupNotificationResponse();
    }

    return () => {
      if (notificationResponseListener.current) {
        // Try to remove listener if it exists
        try {
          notificationResponseListener.current.remove();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    };
  }, [user, router]);

  // Only show loading indicator while auth is initializing
  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </I18nextProvider>
  );
}