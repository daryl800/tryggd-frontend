import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Types
type Language = "sv" | "en";
type Theme = "light" | "dark";

// Translations
const translations = {
    sv: {
        title: "Inställningar",
        language: "Språk",
        swedish: "Svenska",
        english: "English",
        theme: "Tema",
        light: "Ljust",
        dark: "Mörkt",
        systemDefault: "Använd systeminställning",
        notifications: "Notifikationer",
        notificationsDesc: "Aktivera notifieringar för check-ins",
        about: "Om appen",
        privacy: "Integritetspolicy",
        terms: "Användarvillkor",
        logout: "Logga ut",
        resetData: "Återställ data",
        resetWarning: "Är du säker? Alla dina data kommer att raderas.",
        confirmReset: "Återställ",
        cancel: "Avbryt",
        logoutConfirm: "Är du säker att du vill logga ut?",
        ok: "OK",
        account: "Konto",
        information: "Information",
    },
    en: {
        title: "Settings",
        language: "Language",
        swedish: "Swedish",
        english: "English",
        theme: "Theme",
        light: "Light",
        dark: "Dark",
        systemDefault: "Use system setting",
        notifications: "Notifications",
        notificationsDesc: "Enable notifications for check-ins",
        about: "About",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        logout: "Log Out",
        resetData: "Reset Data",
        resetWarning: "Are you sure? All your data will be deleted.",
        confirmReset: "Reset",
        cancel: "Cancel",
        logoutConfirm: "Are you sure you want to log out?",
        ok: "OK",
        account: "Account",
        information: "Information",
    },
};

// Storage keys
const STORAGE_KEYS = {
    LANGUAGE: "@settings_language",
    THEME: "@settings_theme",
    NOTIFICATIONS: "@settings_notifications",
};

export default function SettingsScreen() {
    const router = useRouter();
    const [language, setLanguage] = useState<Language>("sv");
    const [theme, setTheme] = useState<Theme>("light");
    const [useSystemTheme, setUseSystemTheme] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    // Save theme to storage whenever it changes
    useEffect(() => {
        saveThemeSetting();
    }, [theme, useSystemTheme]);

    const loadSettings = async () => {
        try {
            const savedLanguage = await AsyncStorage.getItem(STORAGE_KEYS.LANGUAGE);
            if (savedLanguage === "sv" || savedLanguage === "en") {
                setLanguage(savedLanguage);
            }

            const savedTheme = await AsyncStorage.getItem(STORAGE_KEYS.THEME);
            if (savedTheme === "light" || savedTheme === "dark") {
                setTheme(savedTheme);
                setUseSystemTheme(false);
            }

            const savedNotifications = await AsyncStorage.getItem(
                STORAGE_KEYS.NOTIFICATIONS
            );
            if (savedNotifications !== null) {
                setNotificationsEnabled(savedNotifications === "true");
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const saveLanguage = async (lang: Language) => {
        setLanguage(lang);
        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
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
        await AsyncStorage.setItem(
            STORAGE_KEYS.NOTIFICATIONS,
            enabled.toString()
        );
    };

    const t = translations[language];

    const handleResetData = () => {
        Alert.alert(t.resetData, t.resetWarning, [
            {
                text: t.cancel,
                style: "cancel"
            },
            {
                text: t.confirmReset,
                style: "destructive",
                onPress: () => {
                    // Implement data reset logic here
                    Alert.alert("Data återställd", "All data har raderats.", [
                        { text: t.ok },
                    ]);
                },
            },
        ]);
    };

    const renderLanguageOption = (value: Language, label: string) => (
        <TouchableOpacity
            style={styles.settingOption}
            onPress={() => saveLanguage(value)}
            activeOpacity={0.7}
        >
            <Text style={styles.optionText}>{label}</Text>
            {language === value && (
                <View style={styles.selectedIndicator}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
            )}
        </TouchableOpacity>
    );

    const renderThemeOption = (value: Theme, label: string) => (
        <TouchableOpacity
            style={[styles.settingOption, useSystemTheme && styles.disabledOption]}
            onPress={() => {
                setUseSystemTheme(false);
                setTheme(value);
            }}
            disabled={useSystemTheme}
            activeOpacity={0.7}
        >
            <Text style={[styles.optionText, useSystemTheme && styles.disabledText]}>{label}</Text>
            {!useSystemTheme && theme === value && (
                <View style={styles.selectedIndicator}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                </View>
            )}
        </TouchableOpacity>
    );

    const SettingSection = ({
        title,
        children,
        iconName,
    }: {
        title: string;
        children: React.ReactNode;
        iconName?: keyof typeof Ionicons.glyphMap;
    }) => (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                {iconName && <Ionicons name={iconName} size={20} color="#5FA893" />}
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            <View style={styles.sectionCard}>
                {children}
            </View>
        </View>
    );

    const SettingItem = ({
        label,
        description,
        rightElement,
        onPress,
        isDestructive = false,
        iconName,
    }: {
        label: string;
        description?: string;
        rightElement?: React.ReactNode;
        onPress?: () => void;
        isDestructive?: boolean;
        iconName?: keyof typeof Ionicons.glyphMap;
    }) => (
        <TouchableOpacity
            style={styles.settingItem}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.settingItemContent}>
                {iconName && (
                    <View style={[
                        styles.iconContainer,
                        isDestructive && styles.destructiveIconContainer
                    ]}>
                        <Ionicons
                            name={iconName}
                            size={20}
                            color={isDestructive ? "#EF4444" : "#5FA893"}
                        />
                    </View>
                )}
                <View style={styles.settingTextContainer}>
                    <Text style={[
                        styles.settingItemLabel,
                        isDestructive && styles.destructiveText
                    ]}>
                        {label}
                    </Text>
                    {description && (
                        <Text style={styles.settingItemDescription}>{description}</Text>
                    )}
                </View>
                {rightElement}
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Ionicons name="settings" size={28} color="#5FA893" />
                        <Text style={styles.title}>{t.title}</Text>
                    </View>
                </View>

                {/* Language Settings */}
                <SettingSection
                    title={t.language}
                    iconName="language"
                >
                    {renderLanguageOption("sv", t.swedish)}
                    <View style={styles.divider} />
                    {renderLanguageOption("en", t.english)}
                </SettingSection>

                {/* Theme Settings */}
                <SettingSection
                    title={t.theme}
                    iconName="color-palette"
                >
                    <View style={styles.switchContainer}>
                        <Text style={styles.switchLabel}>{t.systemDefault}</Text>
                        <Switch
                            value={useSystemTheme}
                            onValueChange={setUseSystemTheme}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                            ios_backgroundColor="#D1D5DB"
                        />
                    </View>

                    {!useSystemTheme && (
                        <>
                            <View style={styles.divider} />
                            {renderThemeOption("light", t.light)}
                            <View style={styles.divider} />
                            {renderThemeOption("dark", t.dark)}
                        </>
                    )}
                </SettingSection>

                {/* Notifications */}
                <SettingSection
                    title={t.notifications}
                    iconName="notifications"
                >
                    <View style={styles.switchContainer}>
                        <View style={styles.notificationContent}>
                            <Text style={styles.switchLabel}>{t.notifications}</Text>
                            <Text style={styles.notificationDescription}>
                                {t.notificationsDesc}
                            </Text>
                        </View>
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={saveNotifications}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                            ios_backgroundColor="#D1D5DB"
                        />
                    </View>
                </SettingSection>

                {/* Information */}
                <SettingSection
                    title={t.information}
                    iconName="information-circle"
                >
                    <SettingItem
                        label={t.about}
                        iconName="document-text"
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                        }
                        onPress={() => router.push("/about")}
                    />
                    <View style={styles.divider} />
                    <SettingItem
                        label={t.privacy}
                        iconName="shield-checkmark"
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                        }
                        onPress={() => router.push("/privacy")}
                    />
                    <View style={styles.divider} />
                    <SettingItem
                        label={t.terms}
                        iconName="document-lock"
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" ></Ionicons>
                        }
                        onPress={() => router.push("/terms")}
                    />
                </SettingSection>

                {/* Account Actions */}
                <SettingSection
                    title={t.account}
                    iconName="person-circle"
                >
                    <SettingItem
                        label={t.resetData}
                        iconName="refresh"
                        onPress={handleResetData}
                        isDestructive={false}
                    />
                </SettingSection>

                {/* Additional spacing at bottom */}
                <View style={styles.bottomSpacing} />
            </ScrollView>
        </SafeAreaView>
    );
}

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