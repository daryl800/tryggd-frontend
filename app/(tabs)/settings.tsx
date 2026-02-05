import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // 1. Import hook
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

// Types
type Theme = "light" | "dark";

// 2. Define our 7 supported languages
const SUPPORTED_LANGUAGES = [
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "sv", label: "Svenska", flag: "🇸🇪" },
    { code: "no", label: "Norsk", flag: "🇳🇴" },
    { code: "da", label: "Dansk", flag: "🇩🇰" },
    { code: "fi", label: "Suomi", flag: "🇫🇮" },
    // { code: "zh-Hans", label: "简体中文", flag: "🇨🇳" },
    // { code: "zh-Hant", label: "繁體中文", flag: "🇭🇰" },
];

const STORAGE_KEYS = {
    LANGUAGE: "@app_language", // Keep consistent with your i18n.js
    THEME: "@settings_theme",
    NOTIFICATIONS: "@settings_notifications",
};

export default function SettingsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation(); // Initialize i18next
    const [isLanguageExpanded, setIsLanguageExpanded] = useState(false); // Language Expansion

    const [theme, setTheme] = useState<Theme>("light");
    const [useSystemTheme, setUseSystemTheme] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        saveThemeSetting();
    }, [theme, useSystemTheme]);

    const loadSettings = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
            if (savedTheme === "light" || savedTheme === "dark") {
                setTheme(savedTheme);
                setUseSystemTheme(false);
            }

            const savedNotifications = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
            if (savedNotifications !== null) {
                setNotificationsEnabled(savedNotifications === "true");
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    // 4. Scalable Language Switcher
    const changeLanguage = async (langCode: string) => {
        await i18n.changeLanguage(langCode); // Changes language across whole app
        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
    };

    const saveThemeSetting = async () => {
        try {
            if (useSystemTheme) {
                await AsyncStorage.removeItem(STORAGE_KEYS.THEME);
            } else {
                await AsyncStorage.setItem(STORAGE_KEYS.THEME, theme);
            }
        } catch (error) {
            console.error("Failed to save theme:", error);
        }
    };

    const saveNotifications = async (enabled: boolean) => {
        setNotificationsEnabled(enabled);
        await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, enabled.toString());
    };

    const handleResetData = () => {
        Alert.alert(t("resetData"), t("resetWarning"), [
            { text: t("cancel"), style: "cancel" },
            {
                text: t("confirmReset"),
                style: "destructive",
                onPress: () => {
                    Alert.alert(t("ok"), "Data Reset Completed.");
                },
            },
        ]);
    };

    // Reusable UI Components
    const SettingSection = ({ title, children, iconName }: any) => (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                {iconName && <Ionicons name={iconName} size={20} color="#5FA893" />}
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            <View style={styles.sectionCard}>{children}</View>
        </View>
    );

    const SettingItem = ({ label, description, rightElement, onPress, isDestructive, iconName }: any) => (
        <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.7}>
            <View style={styles.settingItemContent}>
                {iconName && (
                    <View style={[styles.iconContainer, isDestructive && styles.destructiveIconContainer]}>
                        <Ionicons name={iconName} size={20} color={isDestructive ? "#EF4444" : "#5FA893"} />
                    </View>
                )}
                <View style={styles.settingTextContainer}>
                    <Text style={[styles.settingItemLabel, isDestructive && styles.destructiveText]}>{label}</Text>
                    {description && <Text style={styles.settingItemDescription}>{description}</Text>}
                </View>
                {rightElement}
            </View>
        </TouchableOpacity>
    );

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsLanguageExpanded(!isLanguageExpanded);
    };


    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Ionicons name="settings" size={28} color="#5FA893" />
                        <Text style={styles.title}>{t("settings.title")}</Text>
                    </View>
                </View>

                {/* 5. Refactored Multi-Language Section */}
                {/* Language Settings */}
                {/* Language Settings */}
                <SettingSection
                    title={t("settings.language")}
                    iconName="language"
                >
                    {/* 1. Header Row (Current Selection + Toggle) */}
                    <TouchableOpacity
                        style={styles.collapsibleHeader}
                        onPress={() => setIsLanguageExpanded(!isLanguageExpanded)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.languageLabelContainer}>
                            {/* Find the current language object to show the active flag/label in the header */}
                            <Text style={styles.flagText}>
                                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.flag || "🌐"}
                            </Text>
                            <Text style={styles.optionText}>
                                {SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)?.label}
                            </Text>
                        </View>
                        <Ionicons
                            name={isLanguageExpanded ? "chevron-up" : "chevron-down"}
                            size={20}
                            color="#9CA3AF"
                        />
                    </TouchableOpacity>

                    {/* 2. Collapsible Content */}
                    {isLanguageExpanded && (
                        <View style={styles.expandedContent}>
                            <View style={styles.divider} />
                            {SUPPORTED_LANGUAGES.map((lang, index) => (
                                <View key={lang.code}>
                                    <TouchableOpacity
                                        style={styles.settingOption}
                                        onPress={() => {
                                            changeLanguage(lang.code);
                                            setIsLanguageExpanded(false); // Auto-close after selection
                                        }}
                                    >
                                        <View style={styles.languageLabelContainer}>
                                            <Text style={styles.flagText}>{lang.flag}</Text>
                                            <Text style={styles.optionText}>{lang.label}</Text>
                                        </View>
                                        {i18n.language === lang.code && (
                                            <View style={styles.selectedIndicator}>
                                                <Ionicons name="checkmark" size={18} color="#fff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                    {index < SUPPORTED_LANGUAGES.length - 1 && <View style={styles.divider} />}
                                </View>
                            ))}
                        </View>
                    )}
                </SettingSection>

                {/* Theme Settings */}
                <SettingSection title={t("settings.theme")} iconName="color-palette">
                    <View style={styles.switchContainer}>
                        <Text style={styles.switchLabel}>{t("settings.systemDefault")}</Text>
                        <Switch
                            value={useSystemTheme}
                            onValueChange={setUseSystemTheme}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                        />
                    </View>
                    {!useSystemTheme && (
                        <>
                            <View style={styles.divider} />
                            <TouchableOpacity style={styles.settingOption} onPress={() => setTheme("settings.light")}>
                                <Text style={styles.optionText}>{t("settings.light")}</Text>
                                {theme === "light" && <View style={styles.selectedIndicator}><Ionicons name="checkmark" size={18} color="#fff" /></View>}
                            </TouchableOpacity>
                            <View style={styles.divider} />
                            <TouchableOpacity style={styles.settingOption} onPress={() => setTheme("settings.dark")}>
                                <Text style={styles.optionText}>{t("settings.dark")}</Text>
                                {theme === "settings.dark" && <View style={styles.selectedIndicator}><Ionicons name="settings.checkmark" size={18} color="#fff" /></View>}
                            </TouchableOpacity>
                        </>
                    )}
                </SettingSection>

                {/* Notifications */}
                <SettingSection title={t("settings.notifications")} iconName="notifications">
                    <View style={styles.switchContainer}>
                        <View style={styles.notificationContent}>
                            <Text style={styles.switchLabel}>{t("settings.notifications")}</Text>
                            <Text style={styles.notificationDescription}>{t("settings.notificationsDesc")}</Text>
                        </View>
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={saveNotifications}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                        />
                    </View>
                </SettingSection>

                {/* Information */}
                <SettingSection title={t("settings.information")} iconName="information-circle">
                    <SettingItem label={t("settings.about")} iconName="document-text" onPress={() => router.push("/about")} />
                    <View style={styles.divider} />
                    <SettingItem label={t("settings.privacy")} iconName="shield-checkmark" onPress={() => router.push("/privacy")} />
                    <View style={styles.divider} />
                    <SettingItem label={t("settings.terms")} iconName="document-lock" onPress={() => router.push("/terms")} />
                </SettingSection>

                {/* Account */}
                <SettingSection title={t("settings.account")} iconName="person-circle">
                    <SettingItem label={t("settings.resetData")} iconName="refresh" onPress={handleResetData} />
                </SettingSection>

                <View style={styles.bottomSpacing} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        marginBottom: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        marginLeft: 12,
        color: "#1F2937",
    },



    collapsibleHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 16,
    },
    expandedContent: {
        // You can add a slight background color here if you want to distinguish the list
        marginTop: 0,
    },
    languageLabelContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    flagText: {
        fontSize: 20,
        marginRight: 12,
    },


    section: {
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#1F2937",
        marginLeft: 10,
    },
    sectionCard: {
        backgroundColor: "#F9FAFB",
        borderRadius: 20,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: "#F3F4F6",
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    settingOption: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 16,
    },
    disabledOption: {
        opacity: 0.5,
    },
    optionText: {
        fontSize: 16,
        color: "#1F2937",
        fontWeight: "500",
    },
    disabledText: {
        color: "#9CA3AF",
    },
    selectedIndicator: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "#5FA893",
        alignItems: "center",
        justifyContent: "center",
        ...Platform.select({
            ios: {
                shadowColor: '#5FA893',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    switchContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 16,
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
    settingItem: {
        paddingVertical: 16,
    },
    settingItemContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#EDF7F4",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    destructiveIconContainer: {
        backgroundColor: "#FEF2F2",
    },
    settingTextContainer: {
        flex: 1,
    },
    settingItemLabel: {
        fontSize: 16,
        fontWeight: "500",
        color: "#1F2937",
    },
    settingItemDescription: {
        fontSize: 14,
        color: "#6B7280",
        marginTop: 2,
    },
    destructiveText: {
        color: "#EF4444",
    },
    divider: {
        height: 1,
        backgroundColor: "#F3F4F6",
        marginHorizontal: -16,
    },
    bottomSpacing: {
        height: 20,
    },
});