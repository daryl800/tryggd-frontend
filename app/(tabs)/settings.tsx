import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
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

    const handleLogout = () => {
        Alert.alert(t.logout, t.logoutConfirm, [
            { text: t.cancel, style: "cancel" },
            {
                text: t.logout,
                style: "destructive",
                onPress: () => {
                    // Implement logout logic here
                    router.replace("/(auth)/login");
                },
            },
        ]);
    };

    const handleResetData = () => {
        Alert.alert(t.resetData, t.resetWarning, [
            { text: t.cancel, style: "cancel" },
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
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 12,
            }}
            onPress={() => saveLanguage(value)}
        >
            <Text style={{ fontSize: 16 }}>{label}</Text>
            {language === value && (
                <Ionicons name="checkmark" size={20} color="#5FA893" />
            )}
        </TouchableOpacity>
    );

    const renderThemeOption = (value: Theme, label: string) => (
        <TouchableOpacity
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 12,
                opacity: useSystemTheme ? 0.5 : 1,
            }}
            onPress={() => {
                setUseSystemTheme(false);
                setTheme(value);
            }}
            disabled={useSystemTheme}
        >
            <Text style={{ fontSize: 16 }}>{label}</Text>
            {!useSystemTheme && theme === value && (
                <Ionicons name="checkmark" size={20} color="#5FA893" />
            )}
        </TouchableOpacity>
    );

    const SettingSection = ({
        title,
        children,
    }: {
        title: string;
        children: React.ReactNode;
    }) => (
        <View style={{ marginBottom: 32 }}>
            <Text
                style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: "#6B7280",
                    marginBottom: 12,
                    textTransform: "uppercase",
                }}
            >
                {title}
            </Text>
            <View
                style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 12,
                    paddingHorizontal: 16,
                }}
            >
                {children}
            </View>
        </View>
    );

    const SettingItem = ({
        label,
        rightElement,
        onPress,
    }: {
        label: string;
        rightElement?: React.ReactNode;
        onPress?: () => void;
    }) => (
        <TouchableOpacity
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
            }}
            onPress={onPress}
        >
            <Text style={{ fontSize: 16 }}>{label}</Text>
            {rightElement}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}>
            <ScrollView style={{ flex: 1 }}>
                <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 32 }}>
                    {t.title}
                </Text>

                {/* Language Settings */}
                <SettingSection title={t.language}>
                    {renderLanguageOption("sv", t.swedish)}
                    <View
                        style={{ height: 1, backgroundColor: "#F3F4F6", marginHorizontal: -16 }}
                    />
                    {renderLanguageOption("en", t.english)}
                </SettingSection>

                {/* Theme Settings */}
                <SettingSection title={t.theme}>
                    <TouchableOpacity
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: 12,
                        }}
                        onPress={() => setUseSystemTheme(!useSystemTheme)}
                    >
                        <Text style={{ fontSize: 16 }}>{t.systemDefault}</Text>
                        <Switch
                            value={useSystemTheme}
                            onValueChange={setUseSystemTheme}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                        />
                    </TouchableOpacity>

                    {!useSystemTheme && (
                        <>
                            <View style={{ height: 1, backgroundColor: "#F3F4F6", marginHorizontal: -16 }} />
                            {renderThemeOption("light", t.light)}
                            <View style={{ height: 1, backgroundColor: "#F3F4F6", marginHorizontal: -16 }} />
                            {renderThemeOption("dark", t.dark)}
                        </>
                    )}
                </SettingSection>

                {/* Notifications */}
                <SettingSection title={t.notifications}>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingVertical: 12,
                        }}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 16, fontWeight: "500" }}>{t.notifications}</Text>
                            <Text style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
                                {t.notificationsDesc}
                            </Text>
                        </View>
                        <Switch
                            value={notificationsEnabled}
                            onValueChange={saveNotifications}
                            trackColor={{ false: "#D1D5DB", true: "#5FA893" }}
                            thumbColor="#fff"
                        />
                    </View>
                </SettingSection>

                {/* About & Legal */}
                <SettingSection title="Information">
                    <SettingItem
                        label={t.about}
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                        }
                        onPress={() => router.push("/about")}
                    />
                    <SettingItem
                        label={t.privacy}
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                        }
                        onPress={() => router.push("/privacy")}
                    />
                    <SettingItem
                        label={t.terms}
                        rightElement={
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                        }
                        onPress={() => router.push("/terms")}
                    />
                </SettingSection>

                {/* Account Actions */}
                <SettingSection title="Konto">
                    <SettingItem
                        label={t.resetData}
                        onPress={handleResetData}
                    />
                    <SettingItem
                        label={t.logout}
                        onPress={handleLogout}
                    />
                </SettingSection>
            </ScrollView>

            {/* Bottom Navigation */}
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                    marginTop: "auto",
                    paddingVertical: 16,
                    borderTopWidth: 1,
                    borderTopColor: "#F3F4F6",
                }}
            >
                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)")}
                >
                    <Ionicons name="home-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                        {language === "sv" ? "Hem" : "Home"}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)/activities")}
                >
                    <Ionicons name="list-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                        {language === "sv" ? "Aktivitet" : "Activity"}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)/contacts")}
                >
                    <Ionicons name="people-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                        {language === "sv" ? "Kontakter" : "Contacts"}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity style={{ alignItems: "center" }} onPress={() => router.push("/(tabs)/profile")}>
                    <Ionicons name="person-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Profile</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}