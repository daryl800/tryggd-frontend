// app/_layout.tsx
import { setupNotificationHandler } from '@/lib/notifications/handlers';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from "react-native";

import { isSelfReminderEnabled, refreshReminderSchedule, scheduleDailyReminder } from '@/lib/notifications/reminderManager';
import Constants from 'expo-constants';
import * as Linking from "expo-linking";
import * as Notifications from 'expo-notifications';
import { Slot, useRouter } from "expo-router";
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import i18n from '../i18n';

// ✅ Import your custom components
import { CustomText, CustomTextInput } from '@/components/CustomText';

// ✅ Make them available globally
(global as any).Text = CustomText;
(global as any).TextInput = CustomTextInput;

const IS_EXPO_GO = Constants.appOwnership === 'expo';

function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // ... keep all your existing useEffect code exactly the same
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

    const appStateSub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await Notifications.dismissAllNotificationsAsync();
        await Notifications.setBadgeCountAsync(0);
        await refreshReminderSchedule();
      }
    });

    (async () => {
      await refreshReminderSchedule();
    })();

    return () => {
      subscription?.remove();
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    // ... keep your linking code exactly the same
    const handleUrl = (url: string | null) => {
      if (!url) return;

      const parsed = Linking.parse(url);

      if (parsed.path === "auth/callback") {
        alert("Email confirmed. Please login.");
        router.replace("/(auth)/login");
        return;
      }

      if (parsed.queryParams?.type === "recovery" && parsed.queryParams.access_token) {
        const token = parsed.queryParams.access_token;
        router.replace(`/(auth)/reset-password?access_token=${token}`);
        return;
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    return () => {
      subscription.remove();
    };
  }, [router]);

  useEffect(() => {
    // ... keep your push notification code exactly the same
    const setupPushNotifications = async () => {
      if (!user || IS_EXPO_GO) {
        console.log('📱 Expo Go: Skipping push notification setup');
        return;
      }

      try {
        console.log('🚀 Setting up push notifications for user:', user.id);
        const { registerAndSavePushToken } = await import('../lib/notifications/core');
        const success = await registerAndSavePushToken(user.id);

        if (success) {
          console.log('✅ Push notification setup complete');
        } else {
          console.warn('⚠️ Push notification setup had issues');
        }
      } catch (error: any) {
        console.error('⚠️ Error in push notification setup:', error.message || error);
      }
    };

    if (user) {
      setupPushNotifications();
    }
  }, [user]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // FIX: Return Slot directly, no extra View wrapper
  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            {/* REMOVED the extra View wrapper that was causing the tab bar issue */}
            <RootLayoutNav />
          </AuthProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}