import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { clearPushTokens, updateContactCheckInPreference } from '@/lib/notifications/core';
import {
    disableSelfReminder,
    enableSelfReminder
} from '@/lib/notifications/reminderManager';
import { supabase } from '@/lib/supabase';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Enable animation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Define our 5 supported languages
const SUPPORTED_LANGUAGES = [
    { code: "da", label: "Dansk", flag: "🇩🇰" },
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "fi", label: "Suomi", flag: "🇫🇮" },
    { code: "no", label: "Norsk", flag: "🇳🇴" },
    { code: "sv", label: "Svenska", flag: "🇸🇪" },
];

const STORAGE_KEYS = {
    LANGUAGE: "@app_language",
    THEME: "@settings_theme",
    NOTIFICATIONS: "@settings_notifications",
    CHECK_IN_REMINDER: "@settings_check_in_reminder",
    CONTACT_CHECK_IN: "@settings_contact_check_in",
};

export default function SettingsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [isLanguageExpanded, setIsLanguageExpanded] = useState(false);
    const [isNotificationsExpanded, setIsNotificationsExpanded] = useState(false);
    const [checkInReminderEnabled, setCheckInReminderEnabled] = useState(true);
    const [contactCheckInEnabled, setContactCheckInEnabled] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // Load notification settings
            const savedCheckInReminder = await AsyncStorage.getItem(STORAGE_KEYS.CHECK_IN_REMINDER);
            const savedContactCheckIn = await AsyncStorage.getItem(STORAGE_KEYS.CONTACT_CHECK_IN);

            if (savedCheckInReminder !== null) {
                setCheckInReminderEnabled(savedCheckInReminder === 'true');
            }
            if (savedContactCheckIn !== null) {
                setContactCheckInEnabled(savedContactCheckIn === 'true');
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const changeLanguage = async (langCode: string) => {
        await i18n.changeLanguage(langCode);
        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        setIsLanguageExpanded(false);
    };

    const toggleLanguageExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsLanguageExpanded(!isLanguageExpanded);
    };

    const toggleNotificationsExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsNotificationsExpanded(!isNotificationsExpanded);
    };

    // Replace saveCheckInReminder with:
    const saveCheckInReminder = async (enabled: boolean) => {
        setCheckInReminderEnabled(enabled);

        // Save to Supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    reminder_enabled: enabled,
                    daily_reminder_time: '15:00', // Default time
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                }, { onConflict: 'user_id' });
        }

        // Keep AsyncStorage for local backup
        await AsyncStorage.setItem(STORAGE_KEYS.CHECK_IN_REMINDER, enabled.toString());

        // Your existing notification logic
        if (enabled) {
            await enableSelfReminder();
        } else {
            await disableSelfReminder();
        }
    };


    const saveContactCheckIn = async (enabled: boolean) => {
        setContactCheckInEnabled(enabled);
        await updateContactCheckInPreference(enabled); // Now syncs to Supabase
        await AsyncStorage.setItem(
            STORAGE_KEYS.CONTACT_CHECK_IN,
            enabled.toString()
        );
    };



    const handleLogout = async () => {
        Alert.alert(t('profile.logout.title'), t('profile.logout.confirm'), [
            {
                text: t('common.cancel'),
                style: 'cancel',
            },
            {
                text: t('profile.logout.button'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        // 1. Get the current user before signing out
                        const { data: { user } } = await supabase.auth.getUser();

                        if (user) {
                            // 2. Clear push tokens from Supabase (sets expo_push_token to null)
                            await clearPushTokens(user.id);

                            // 3. Get and potentially invalidate the push token from Expo
                            const pushToken = await AsyncStorage.getItem('@expo_push_token');
                            if (pushToken) {
                                // Optional: Tell Expo this token is no longer valid
                                // This helps with cleanup on Expo's side
                                try {
                                    await fetch('https://exp.host/--/api/v2/push/delete', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            token: pushToken
                                        }),
                                    });
                                } catch (e) {
                                    console.log('Note: Could not delete token from Expo', e);
                                }
                            }
                        }

                        // 4. Clear ALL AsyncStorage items
                        const keysToRemove = [
                            '@expo_push_token',                    // Push notification token
                            '@user_profile',                       // User profile data
                            '@app_language',                       // Language setting
                            '@settings_notifications',             // Notification settings
                            '@settings_check_in_reminder',         // Check-in reminder setting
                            '@settings_contact_check_in',          // Contact check-in setting
                            // Add any other keys your app uses
                        ];

                        await AsyncStorage.multiRemove(keysToRemove);

                        // 5. Sign out from Supabase
                        const { error } = await supabase.auth.signOut();
                        if (error) throw error;

                        // 6. Navigate to login
                        router.replace('/(auth)/login');

                    } catch (error) {
                        console.error('Error during logout:', error);
                        // Even if cleanup fails, try to navigate to login
                        router.replace('/(auth)/login');
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.mainContainer} edges={['top']}>
            {/* Screen Header - Handles its own top padding */}
            <ScreenHeader
                title={t('settings.title')}
                iconName="settings"
            />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Language Settings Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
                    <View style={styles.card}>
                        {/* Current Language Header */}
                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={toggleLanguageExpand}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="language" size={22} color={BaseColors.primary} />
                                </View>
                                <View style={styles.settingText}>
                                    <Text style={styles.settingTitle}>
                                        {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.label}
                                    </Text>
                                    <Text style={styles.settingSubtitle}>
                                        {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.flag}
                                    </Text>
                                </View>
                            </View>
                            <Ionicons
                                name={isLanguageExpanded ? "chevron-up" : "chevron-down"}
                                size={22}
                                color={BaseColors.neutral[400]}
                            />
                        </TouchableOpacity>

                        {/* Language Options */}
                        {isLanguageExpanded && (
                            <View style={styles.expandedSection}>
                                {SUPPORTED_LANGUAGES.map((lang, index) => (
                                    <View key={lang.code}>
                                        <TouchableOpacity
                                            style={[
                                                styles.languageOption,
                                                i18n.language === lang.code && styles.selectedOption
                                            ]}
                                            onPress={() => changeLanguage(lang.code)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.languageContent}>
                                                <Text style={styles.languageFlag}>{lang.flag}</Text>
                                                <Text style={styles.languageName}>{lang.label}</Text>
                                            </View>
                                            {i18n.language === lang.code && (
                                                <View style={styles.selectedIndicator}>
                                                    <Ionicons name="checkmark" size={18} color="#fff" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                        {index < SUPPORTED_LANGUAGES.length - 1 && (
                                            <View style={styles.divider} />
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>

                {/* Notifications */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t("settings.notifications")}</Text>
                    <View style={styles.card}>
                        {/* Notifications Header */}
                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={toggleNotificationsExpand}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="notifications" size={22} color={BaseColors.primary} />
                                </View>
                                <View style={styles.settingText}>
                                    <Text style={styles.settingTitle}>Notification preferences</Text>
                                    <Text style={styles.settingSubtitle}>
                                        {checkInReminderEnabled || contactCheckInEnabled
                                            ? `${checkInReminderEnabled ? 'Reminders' : ''}${checkInReminderEnabled && contactCheckInEnabled ? ' & ' : ''}${contactCheckInEnabled ? 'Activity' : ''}`
                                            : 'All notifications off'}
                                    </Text>
                                </View>
                            </View>
                            <Ionicons
                                name={isNotificationsExpanded ? "chevron-up" : "chevron-down"}
                                size={22}
                                color={BaseColors.neutral[400]}
                            />
                        </TouchableOpacity>

                        {/* Notification Options */}
                        {isNotificationsExpanded && (
                            <View style={styles.expandedSection}>
                                {/* Check-in Reminder Switch */}
                                <View style={styles.notificationSwitchItem}>
                                    <View style={styles.notificationContent}>
                                        <Text style={styles.switchLabel}>Stay on track</Text>
                                        <Text style={styles.notificationDescription}>
                                            Remind me to complete my personal safety daily check-ins
                                        </Text>
                                    </View>
                                    <Switch
                                        value={checkInReminderEnabled}
                                        onValueChange={saveCheckInReminder}
                                        trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                                        thumbColor="#fff"
                                        ios_backgroundColor="#D1D5DB"
                                    />
                                </View>

                                <View style={styles.divider} />

                                {/* Contact Check-in Switch */}
                                <View style={styles.notificationSwitchItem}>
                                    <View style={styles.notificationContent}>
                                        <Text style={styles.switchLabel}>Contact activity</Text>
                                        <Text style={styles.notificationDescription}>
                                            Notify me when my contacts complete their check-ins
                                        </Text>
                                    </View>
                                    <Switch
                                        value={contactCheckInEnabled}
                                        onValueChange={saveContactCheckIn}
                                        trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                                        thumbColor="#fff"
                                        ios_backgroundColor="#D1D5DB"
                                    />
                                </View>
                            </View>
                        )}
                    </View>
                </View>

                {/* Information Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t("settings.information")}</Text>
                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("http://tryggd.com/about-tryggd")}
                            // onPress={() => router.push("/about")}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="document-text" size={22} color={BaseColors.primary} />
                                </View>
                                <Text style={styles.settingTitle}>{t("settings.about")}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={BaseColors.neutral[400]} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("http://tryggd.com/privacy-policy")}
                            // onPress={() => router.push("/privacy")}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="shield-checkmark" size={22} color={BaseColors.primary} />
                                </View>
                                <Text style={styles.settingTitle}>{t("settings.privacy")}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={BaseColors.neutral[400]} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("http://tryggd.com/terms-of-service")}
                            // onPress={() => router.push("/terms")}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="document-lock" size={22} color={BaseColors.primary} />
                                </View>
                                <Text style={styles.settingTitle}>{t("settings.terms")}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={BaseColors.neutral[400]} />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {/* Fixed bottom logout */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name="log-out-outline"
                        size={20}
                        color={BaseColors.error}
                    />
                    <Text style={styles.logoutText}>
                        {t('profile.buttons.logout')}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// ==================== STYLES ====================

const GAP = 16;

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: BaseColors.background,
    },
    scrollContent: {
        paddingHorizontal: SCREEN_PADDING.horizontal,
        paddingTop: 14
    },
    section: {
        marginBottom: GAP,
    },
    sectionLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginBottom: 6,
        marginLeft: 4,
    },
    card: {
        backgroundColor: BaseColors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: GAP,
    },
    settingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: BaseColors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    settingText: {
        flex: 1,
    },
    settingTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: BaseColors.text.dark,
    },
    settingSubtitle: {
        fontSize: 14,
        color: BaseColors.neutral[500],
        marginTop: 2,
    },
    expandedSection: {
        marginTop: 8,
    },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    selectedOption: {
        backgroundColor: BaseColors.primaryLight + '20',
    },
    languageContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    languageFlag: {
        fontSize: 20,
        marginRight: 12,
    },
    languageName: {
        fontSize: 16,
        fontWeight: '500',
        color: BaseColors.text.dark,
    },
    selectedIndicator: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: BaseColors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    bottomSpacing: {
        height: 20,
    },
    notificationSwitchItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 16,
        paddingHorizontal: 16,
    },
    switchLabel: {
        fontSize: 16,
        color: "#1F2937",
        fontWeight: "500",
    },
    notificationContent: {
        flex: 1,
        marginRight: 16,
    },
    notificationDescription: {
        fontSize: 14,
        color: "#6B7280",
        marginTop: 4,
        lineHeight: 20,
    },
    footer: {
        paddingHorizontal: SCREEN_PADDING.horizontal,
        paddingBottom: 16,
        paddingTop: 8,
        backgroundColor: BaseColors.background,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.errorLight,
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: BaseColors.errorBorder,
        gap: 10,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '600',
        color: BaseColors.error,
    },
});