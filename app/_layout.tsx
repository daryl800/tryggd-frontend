// app/_layout.tsx
import { setupNotificationHandler } from '@/lib/notifications/handlers'; // ✅ Fixed import path
import { isSelfReminderEnabled, scheduleDailyReminder } from '@/lib/notifications/reminderManager';
import Constants from 'expo-constants';
import * as Linking from "expo-linking";
import * as Notifications from 'expo-notifications';
import { Slot, useRouter } from "expo-router";
import React, { useEffect, useRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, AppState, View } from "react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import '../i18n';
import i18n from '../i18n';

// ✅ Check if we're in Expo Go
const IS_EXPO_GO = Constants.appOwnership === 'expo';

function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const router = useRouter();
  const notificationResponseListener = useRef<any>(null);

  useEffect(() => {
    let subscription: Notifications.Subscription | undefined;

    const init = async () => {

      subscription = await setupNotificationHandler();
      const initReminder = async () => {
        const enabled = await isSelfReminderEnabled();
        if (enabled) {
          await scheduleDailyReminder();
        }
      };
      initReminder();

    };

    init();

    const clearBadge = async () => {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.setBadgeCountAsync(0);
    };
    clearBadge();

    // ✅ CLEAR when app comes foreground
    const appStateSub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await Notifications.dismissAllNotificationsAsync();
        await Notifications.setBadgeCountAsync(0);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);


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

  // Setup push notifications for standalone builds
  useEffect(() => {
    const setupPushNotifications = async () => {
      // ✅ Skip in Expo Go
      if (!user || IS_EXPO_GO) {
        console.log('📱 Expo Go: Skipping push notification setup');
        return;
      }

      try {
        console.log('🚀 Setting up push notifications for user:', user.id);

        // Use the function you already have in core.ts
        const { registerAndSavePushToken } = await import('../lib/notifications/core');
        const success = await registerAndSavePushToken(user.id);

        if (success) {
          console.log('✅ Push notification setup complete');
        } else {
          console.warn('⚠️ Push notification setup had issues');
        }
      } catch (error: any) {
        console.error('⚠️ Error in push notification setup:', error.message || error);
        // Don't crash the app
      }
    };

    if (user) {
      setupPushNotifications();
    }
  }, [user]); // ✅ Only depends on user, not router

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