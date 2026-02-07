import HeaderWithBack from '@/components/common/HeaderWithBack';
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
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
};

export default function SettingsScreen() {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const [isLanguageExpanded, setIsLanguageExpanded] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // Load any saved settings if needed
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    };

    const changeLanguage = async (langCode: string) => {
        await i18n.changeLanguage(langCode);
        await AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        setIsLanguageExpanded(false);
    };

    const toggleExpand = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsLanguageExpanded(!isLanguageExpanded);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <HeaderWithBack
                title={t("settings.title")}
                iconName="settings"
                onBackPress={() => router.push("/profile")}
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
                            onPress={toggleExpand}
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

                {/* Information Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>{t("settings.information")}</Text>
                    <View style={styles.card}>
                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("/about")}
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

                        <View style={styles.divider} />

                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("/privacy")}
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

                        <View style={styles.divider} />

                        <TouchableOpacity
                            style={styles.settingItem}
                            onPress={() => router.push("/terms")}
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

                {/* Bottom Spacing */}
                <View style={styles.bottomSpacing} />
            </ScrollView>
        </SafeAreaView >
    );
}

// ==================== STYLES ====================

const GAP = 16;

const styles = StyleSheet.create({
    fullContainer: {
        flex: 1,
        backgroundColor: BaseColors.background,
        marginBottom: 24,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: SCREEN_PADDING.horizontal,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginBottom: 12,
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
        paddingVertical: 18,
        paddingHorizontal: 16,
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
        backgroundColor: BaseColors.primaryLight + '20', // 20% opacity
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
    divider: {
        height: 1,
        backgroundColor: BaseColors.neutral[200],
        marginHorizontal: 16,
    },
    bottomSpacing: {
        height: 20,
    },
});