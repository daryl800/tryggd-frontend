// app/_layout.tsx
import { Slot, useRouter } from "expo-router";
import React, { useEffect, useRef } from 'react';
import { I18nextProvider } from 'react-i18next'; // ✅ Add this import
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import '../i18n'; // ✅ Import to initialize i18n
import i18n from '../i18n'; // ✅ Import i18n instance (adjust path as needed)
import {
  IS_EXPO_GO,
  registerForPushNotificationsAsync,
  savePushToken
} from '../lib/notifications';


function RootLayoutNav() {
  const { initialized, user } = useAuth();
  const router = useRouter();
  const notificationResponseListener = useRef<any>(null);

  // Setup push notifications for development builds
  useEffect(() => {
    const setupPushNotifications = async () => {
      if (!user || IS_EXPO_GO) return;

      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await savePushToken(user.id, token);
        }
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }
    };

    // Handle notification taps (for development builds)
    const setupNotificationResponse = async () => {
      if (IS_EXPO_GO) return;

      try {
        const { default: Notifications } = await import('expo-notifications');

        notificationResponseListener.current =
          Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;

            // Handle contact request notifications
            if (data.type === 'contact_request') {
              router.push('/(tabs)/contacts');
            } else if (data.type === 'contact_accepted') {
              router.push('/(tabs)/contacts');
            }
          });
      } catch (error) {
        console.log('Notification response handler not available in this environment');
      }
    };

    if (user) {
      setupPushNotifications();
      setupNotificationResponse();
    }

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
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