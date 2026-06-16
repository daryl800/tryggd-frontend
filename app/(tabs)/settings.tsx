import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import {
    DEFAULT_HOME_STYLE,
    HOME_STYLE_STORAGE_KEY,
    isHomeStyle,
    type HomeStyle,
} from '@/constants/homeLayout';
import { SCREEN_PADDING } from '@/constants/spacing';
import { updateContactCheckInPreference } from '@/lib/notifications/core';
import Constants from 'expo-constants';
import {
    disableSelfReminder,
    enableSelfReminder
} from '@/lib/notifications/reminderManager';
import { supabase } from '@/lib/supabase';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    LayoutAnimation,
    Linking,
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
import { iosFontSize } from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';

// Enable animation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Supported languages shown in Settings
const SUPPORTED_LANGUAGES = [
    { code: "da", label: "Dansk", flag: "🇩🇰" },
    { code: "de", label: "Deutsch", flag: "🇩🇪" },
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "es", label: "Español", flag: "🇪🇸" },
    { code: "fi", label: "Suomi", flag: "🇫🇮" },
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "it", label: "Italiano", flag: "🇮🇹" },
    { code: "no", label: "Norsk", flag: "🇳🇴" },
    { code: "sv", label: "Svenska", flag: "🇸🇪" },
    { code: "th", label: "ไทย", flag: "🇹🇭" },
    { code: "zh-Hans", label: "简体中文", flag: "🇭🇰" },
    { code: "zh-Hant", label: "繁體中文", flag: "🇨🇳" },
    { code: "ja", label: "日本語", flag: "🇯🇵" },
    { code: "ko", label: "한국어", flag: "🇰🇷" },
];

const STORAGE_KEYS = {
    LANGUAGE: "@app_language",
    THEME: "@settings_theme",
    NOTIFICATIONS: "@settings_notifications",
    CHECK_IN_REMINDER: "@settings_check_in_reminder",
    CONTACT_CHECK_IN: "@settings_contact_check_in",
};

export default function SettingsScreen() {
    const { t, i18n } = useTranslation();
    const { capabilities } = useAuth();
    const [isLanguageExpanded, setIsLanguageExpanded] = useState(false);
    const [isNotificationsExpanded, setIsNotificationsExpanded] = useState(false);
    const [isHomeStyleExpanded, setIsHomeStyleExpanded] = useState(false);
    const [checkInReminderEnabled, setCheckInReminderEnabled] = useState(true);
    const [contactCheckInEnabled, setContactCheckInEnabled] = useState(true);
    const [homeStyle, setHomeStyle] = useState<HomeStyle>(DEFAULT_HOME_STYLE);
    const appVersion = Constants.expoConfig?.version || 'Unknown';
    const buildNumber = Constants.nativeBuildVersion;
    const versionLabel = buildNumber
        ? `Version ${appVersion} (${buildNumber})`
        : `Version ${appVersion}`;

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // Load notification settings from AsyncStorage
            const savedCheckInReminder = await AsyncStorage.getItem(STORAGE_KEYS.CHECK_IN_REMINDER);
            const savedContactCheckIn = await AsyncStorage.getItem(STORAGE_KEYS.CONTACT_CHECK_IN);
            const savedLanguage = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);
            const savedHomeStyle = await AsyncStorage.getItem(HOME_STYLE_STORAGE_KEY);

            if (savedCheckInReminder !== null) {
                setCheckInReminderEnabled(savedCheckInReminder === 'true');
            }
            if (savedContactCheckIn !== null) {
                setContactCheckInEnabled(savedContactCheckIn === 'true');
            }
            if (isHomeStyle(savedHomeStyle)) {
                setHomeStyle(savedHomeStyle);
            }

            // Load language from Supabase and sync with i18n if needed
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: settings, error } = await supabase
                    .from('user_settings')
                    .select('language, home_style')
                    .eq('user_id', user.id)
                    .single();

                if (!error && settings?.language) {
                    // If Supabase has a language setting and it's different from current
                    if (settings.language !== i18n.language) {
                        await i18n.changeLanguage(settings.language);
                        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, settings.language);
                    }
                } else if (savedLanguage) {
                    // If no Supabase setting but we have AsyncStorage, update Supabase
                    await supabase
                        .from('user_settings')
                        .upsert({
                            user_id: user.id,
                            language: savedLanguage,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                }

                if (!error && isHomeStyle(settings?.home_style)) {
                    setHomeStyle(settings.home_style);
                    await AsyncStorage.setItem(HOME_STYLE_STORAGE_KEY, settings.home_style);
                } else if (isHomeStyle(savedHomeStyle)) {
                    await supabase
                        .from('user_settings')
                        .upsert({
                            user_id: user.id,
                            home_style: savedHomeStyle,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'user_id' });
                }
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const changeLanguage = async (langCode: string) => {
        // Update i18n and AsyncStorage
        await i18n.changeLanguage(langCode);
        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);

        // Update user_settings table in Supabase
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error } = await supabase
                    .from('user_settings')
                    .upsert({
                        user_id: user.id,
                        language: langCode,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'user_id'
                    });

                if (error) {
                    console.error("Failed to update language in Supabase:", error);
                }
            }
        } catch (error) {
            console.error("Error updating language in Supabase:", error);
        }

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

    const toggleHomeStyleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsHomeStyleExpanded(!isHomeStyleExpanded);
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

    const saveHomeStyle = async (style: HomeStyle) => {
        setHomeStyle(style);
        setIsHomeStyleExpanded(false);
        await AsyncStorage.setItem(HOME_STYLE_STORAGE_KEY, style);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error } = await supabase
                    .from('user_settings')
                    .upsert({
                        user_id: user.id,
                        home_style: style,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (error) {
                    console.error("Failed to update home style in Supabase:", error);
                }
            }
        } catch (error) {
            console.error("Error updating home style in Supabase:", error);
        }
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

                {capabilities.isPlus && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>{t("settings.homeStyle.title")}</Text>
                        <View style={styles.card}>
                            {/* Current Home Style Header */}
                            <TouchableOpacity
                                style={styles.settingItem}
                                onPress={toggleHomeStyleExpand}
                                activeOpacity={0.7}
                            >
                                <View style={styles.settingContent}>
                                    <View style={styles.settingIcon}>
                                        <Ionicons
                                            name={homeStyle === 'simple' ? 'heart-circle' : 'options'}
                                            size={20}
                                            color={BaseColors.primary}
                                        />
                                    </View>
                                    <View style={styles.settingText}>
                                        <Text style={styles.settingTitle}>
                                            {t(`settings.homeStyle.${homeStyle}.title`)}
                                        </Text>
                                        <Text style={styles.settingSubtitle}>
                                            {t(`settings.homeStyle.${homeStyle}.description`)}
                                        </Text>
                                    </View>
                                </View>
                                <Ionicons
                                    name={isHomeStyleExpanded ? "chevron-up" : "chevron-down"}
                                    size={22}
                                    color={BaseColors.neutral[400]}
                                />
                            </TouchableOpacity>

                            {/* Home Style Options */}
                            {isHomeStyleExpanded && (
                                <View style={styles.expandedSection}>
                                    {(['simple', 'enhanced'] as const).map((style, index) => {
                                        const selected = homeStyle === style;
                                        return (
                                            <View key={style}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.settingItem,
                                                        selected && styles.selectedOption,
                                                    ]}
                                                    onPress={() => saveHomeStyle(style)}
                                                    activeOpacity={0.7}
                                                >
                                                    <View style={styles.settingContent}>
                                                        <View style={styles.settingIcon}>
                                                            <Ionicons
                                                                name={style === 'simple' ? 'heart-circle' : 'options'}
                                                                size={20}
                                                                color={BaseColors.primary}
                                                            />
                                                        </View>
                                                        <View style={styles.settingText}>
                                                            <Text style={styles.settingTitle}>
                                                                {t(`settings.homeStyle.${style}.title`)}
                                                            </Text>
                                                            <Text style={styles.settingSubtitle}>
                                                                {t(`settings.homeStyle.${style}.description`)}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    {selected && (
                                                        <View style={styles.selectedIndicator}>
                                                            <Ionicons name="checkmark" size={18} color="#fff" />
                                                        </View>
                                                    )}
                                                </TouchableOpacity>
                                                {index === 0 && <View style={styles.divider} />}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </View>
                )}

                {/* Notifications */}
                {/* Notifications */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t("settings.notifications.title")}</Text>
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
                                    <Text style={styles.settingTitle}>{t("settings.notifications.preferences")}</Text>
                                    <Text style={styles.settingSubtitle}>
                                        {checkInReminderEnabled || contactCheckInEnabled
                                            ? `${checkInReminderEnabled ? t("settings.notifications.stayOnTrack.title") : ""}${checkInReminderEnabled && contactCheckInEnabled ? " & " : ""
                                            }${contactCheckInEnabled ? t("settings.notifications.contactActivity.title") : ""}`
                                            : t("settings.notifications.summary.allOff")}
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
                                        <Text style={styles.switchLabel}>
                                            {t("settings.notifications.stayOnTrack.title")}
                                        </Text>
                                        <Text style={styles.notificationDescription}>
                                            {t("settings.notifications.stayOnTrack.description")}
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
                                        <Text style={styles.switchLabel}>
                                            {t("settings.notifications.contactActivity.title")}
                                        </Text>
                                        <Text style={styles.notificationDescription}>
                                            {t("settings.notifications.contactActivity.description")}
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
                            onPress={() => Linking.openURL("http://tryggd.com/about-tryggd")}
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
                            onPress={() => Linking.openURL("http://tryggd.com/privacy-policy")}
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
                            onPress={() => Linking.openURL("http://tryggd.com/terms-of-service")}
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

                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => Linking.openURL("mailto:support@tryggd.com?subject=Tryggd%20Feedback")}
                            activeOpacity={0.7}
                        >
                            <View style={styles.settingContent}>
                                <View style={styles.settingIcon}>
                                    <Ionicons name="mail" size={22} color={BaseColors.primary} />
                                </View>
                                <Text style={styles.settingTitle}>{t("settings.feedback")}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={BaseColors.neutral[400]} />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Text style={styles.versionText}>{versionLabel}</Text>
            </View>
        </SafeAreaView>
    );
}

// ==================== STYLES ====================

const CARD_HORIZONTAL_PADDING = 16;
const CARD_ITEM_VERTICAL_PADDING = 12;

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: BaseColors.background,
    },
    scrollContent: {
        paddingHorizontal: SCREEN_PADDING.horizontal,
        paddingTop: 12,
    },
    section: {
        marginBottom: 14,
    },
    sectionLabel: {
        fontSize: iosFontSize(17),
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
        paddingVertical: CARD_ITEM_VERTICAL_PADDING,
        paddingHorizontal: CARD_HORIZONTAL_PADDING,
    },
    settingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    settingIcon: {
        width: 34,
        height: 34,
        borderRadius: 9,
        backgroundColor: BaseColors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    settingText: {
        flex: 1,
    },
    settingTitle: {
        fontSize: iosFontSize(15),
        fontWeight: '500',
        color: BaseColors.text.dark,
    },
    settingSubtitle: {
        fontSize: iosFontSize(13),
        color: BaseColors.neutral[500],
        marginTop: 2,
    },
    expandedSection: {
        marginTop: 4,
    },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: CARD_ITEM_VERTICAL_PADDING,
        paddingHorizontal: CARD_HORIZONTAL_PADDING,
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
        fontSize: iosFontSize(18),
        marginRight: 10,
    },
    languageName: {
        fontSize: iosFontSize(15),
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
        paddingVertical: CARD_ITEM_VERTICAL_PADDING,
        paddingHorizontal: CARD_HORIZONTAL_PADDING,
    },
    switchLabel: {
        fontSize: iosFontSize(15),
        color: "#1F2937",
        fontWeight: "500",
    },
    notificationContent: {
        flex: 1,
        marginRight: 16,
    },
    notificationDescription: {
        fontSize: iosFontSize(13),
        color: "#6B7280",
        marginTop: 4,
        lineHeight: 18,
    },
    divider: {
        height: 1,
        backgroundColor: BaseColors.neutral[200],
        marginHorizontal: CARD_HORIZONTAL_PADDING,
    },
    footer: {
        alignItems: 'center',
        paddingBottom: 16,
        paddingTop: 6,
    },
    versionText: {
        color: BaseColors.neutral[500],
        fontSize: iosFontSize(12),
        fontWeight: '500',
    },
});
