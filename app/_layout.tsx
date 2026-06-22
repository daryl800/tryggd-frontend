// app/_layout.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from "expo-linking";
import { Redirect, Slot, useNavigationContainerRef, useRouter, useSegments } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Custom components & providers
import { CustomText, CustomTextInput } from '@/components/CustomText';
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import i18n, { getDevicePreferredLanguage, LANGUAGE_STORAGE_KEY, resolveSupportedLanguage } from '../i18n';

// Services & utilities
import { tokenManager } from '@/lib/auth/tokenManager';
import { authRedirectPath, createSessionFromUrl } from '@/lib/auth/oauth';
import { hasCompletedOnboarding } from '@/lib/onboarding/state';
import { registerAndSavePushToken } from '@/lib/notifications/core';
import { setupNotificationHandler } from '@/lib/notifications/handlers';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

// Make custom components available globally
(global as any).Text = CustomText;
(global as any).TextInput = CustomTextInput;

const IS_EXPO_GO = Constants.appOwnership === 'expo';
const NAVIGATION_STATE_KEY = "NAVIGATION_STATE_V1";

// ============================================
// Navigation State Manager
// ============================================
function useNavigationPersistence(navigationRef: any) {
  const [isNavReady, setIsNavReady] = React.useState(false);

  // Restore navigation state
  useEffect(() => {
    const restoreState = async () => {
      try {
        const savedState = await AsyncStorage.getItem(NAVIGATION_STATE_KEY);
        if (savedState) {
          const state = JSON.parse(savedState);
          const unsubscribe = navigationRef.addListener("ready", () => {
            navigationRef.resetRoot(state);
          });
          return unsubscribe;
        }
      } catch (e) {
        console.warn("Failed to restore navigation state", e);
      } finally {
        setIsNavReady(true);
      }
    };

    restoreState();
  }, []);

  // Save navigation state
  useEffect(() => {
    const unsubscribe = navigationRef.addListener("state", async () => {
      const state = navigationRef.getRootState();
      if (state) {
        await AsyncStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(state));
      }
    });

    return unsubscribe;
  }, [navigationRef]);

  return isNavReady;
}

// ============================================
// Notification Manager
// ============================================
function useNotifications(user: any) {
  useEffect(() => {
    // Setup notification handler
    let subscription: any;
    const initNotifications = async () => {
      subscription = await setupNotificationHandler();
    };
    initNotifications();

    // Clear badges when app becomes active
    const clearBadge = async () => {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.setBadgeCountAsync(0);
    };
    clearBadge();

    const appStateSub = AppState.addEventListener("change", async (state) => {
      if (state === "active") {
        await Notifications.dismissAllNotificationsAsync();
        await Notifications.setBadgeCountAsync(0);
      }
    });

    return () => {
      subscription?.remove();
      appStateSub.remove();
    };
  }, []);

  // Setup push notifications when user logs in
  useEffect(() => {
    if (!user || IS_EXPO_GO) {
      console.log('📱 Expo Go: Skipping push notification setup');
      return;
    }

    const setupPush = async () => {
      try {
        console.log('🚀 Setting up push notifications for user:', user.id);
        const success = await registerAndSavePushToken(user.id);
        console.log(success ? '✅ Push setup complete' : '⚠️ Push setup had issues');
      } catch (error: any) {
        console.error('⚠️ Push setup error:', error.message || error);
      }
    };

    setupPush();
  }, [user?.id]);
}

// ============================================
// Deep Link Manager
// ============================================
function useDeepLinking(router: any) {
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;

      try {
        const session = await createSessionFromUrl(url);
        if (session) {
          router.replace("/");
          return;
        }
      } catch (error) {
        console.error("Failed to create session from deep link", error);
      }

      const parsed = Linking.parse(url);

      if (
        parsed.path === authRedirectPath &&
        (parsed.queryParams?.type === "signup" ||
          parsed.queryParams?.type === "email" ||
          parsed.queryParams?.token_hash)
      ) {
        alert("Email confirmed. Please login.");
        router.replace("/(auth)/login");
        return;
      }

      if (parsed.path === 'invite' || parsed.path?.startsWith('invite/')) {
        const token =
          typeof parsed.queryParams?.token === 'string'
            ? parsed.queryParams.token
            : parsed.path?.startsWith('invite/')
              ? parsed.path.slice('invite/'.length)
              : undefined;

        router.replace({
          pathname: '/invite',
          params: token ? { token } : {},
        });
        return;
      }

      if (parsed.queryParams?.type === "recovery" && parsed.queryParams.access_token) {
        router.replace({
          pathname: "/(auth)/forgot-password",
          params: { access_token: parsed.queryParams.access_token }
        });
        return;
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleUrl(url);
    });

    return () => subscription.remove();
  }, [router]);
}

// ============================================
// Main Navigation Component
// ============================================
function RootLayoutNav() {
  const { initialized, user, needsUsername } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const navigationRef = useNavigationContainerRef();
  const [languageReady, setLanguageReady] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // Initialize services
  useEffect(() => {
    tokenManager.startAutoRefresh();
    return () => tokenManager.stopAutoRefresh();
  }, []);

  // Use custom hooks
  const isNavReady = useNavigationPersistence(navigationRef);
  useNotifications(user);
  useDeepLinking(router);

  useEffect(() => {
    const loadOnboardingState = async () => {
      try {
        setHasSeenOnboarding(await hasCompletedOnboarding());
      } finally {
        setOnboardingReady(true);
      }
    };

    void loadOnboardingState();
  }, []);

  useEffect(() => {
    if (!onboardingReady || hasSeenOnboarding) return;

    const refreshOnboardingState = async () => {
      if (await hasCompletedOnboarding()) {
        setHasSeenOnboarding(true);
      }
    };

    void refreshOnboardingState();
  }, [hasSeenOnboarding, onboardingReady, segments]);

  useEffect(() => {
    const syncLanguage = async () => {
      if (!initialized) return;

      setLanguageReady(false);

      try {
        if (!user) {
          const deviceLanguage = getDevicePreferredLanguage();
          if (resolveSupportedLanguage(i18n.language) !== deviceLanguage) {
            await i18n.changeLanguage(deviceLanguage);
          }
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, deviceLanguage);
          return;
        }

        const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const currentLanguage = resolveSupportedLanguage(savedLanguage || i18n.language || getDevicePreferredLanguage());

        if (!savedLanguage) {
          await i18n.changeLanguage(currentLanguage);
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
        }

        const { data: settings } = await supabase
          .from('user_settings')
          .select('language')
          .eq('user_id', user.id)
          .maybeSingle();

        const serverLanguage = resolveSupportedLanguage(settings?.language);
        const shouldPreferLocal =
          !settings?.language ||
          (currentLanguage !== 'en' && serverLanguage === 'en' && needsUsername);

        if (shouldPreferLocal) {
          await supabase
            .from('user_settings')
            .upsert({
              user_id: user.id,
              language: currentLanguage,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
          return;
        }

        if (settings?.language && serverLanguage !== currentLanguage) {
          await i18n.changeLanguage(serverLanguage);
          await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, serverLanguage);
        }
      } catch (error) {
        console.error('Failed to sync language preference', error);
      } finally {
        setLanguageReady(true);
      }
    };

    void syncLanguage();
  }, [initialized, needsUsername, user?.id]);

  if (!initialized || !isNavReady || !languageReady || !onboardingReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isOnboardingRoute = segments[0] === 'onboarding';

  if (!hasSeenOnboarding && !isOnboardingRoute) {
    return <Redirect href="/onboarding" />;
  }

  if (hasSeenOnboarding && isOnboardingRoute) {
    return <Redirect href={user ? (needsUsername ? "/complete-profile" : "/(tabs)") : "/(auth)/login"} />;
  }

  return <Slot />;
}

// ============================================
// Root Layout
// ============================================
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
