import { useAuth } from "@/contexts/AuthContext";
import { deriveDisplayName, isLikelyGeneratedDisplayName } from "@/lib/profile/displayName";
import {
    getUsernameValidationMessage,
    isValidUsername,
    normalizeUsername,
    suggestUsername,
} from "@/lib/profile/username";
import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { iosFontSize } from '@/constants/typography';

export default function CompleteProfileScreen() {
    const { t } = useTranslation();
    const { user, profile, loading, needsUsername, refreshProfile } = useAuth();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user && !loading) {
            router.replace("/(auth)/login");
            return;
        }

        if (user && !needsUsername) {
            router.replace("/");
        }
    }, [user, loading, needsUsername]);

    useEffect(() => {
        if (profile?.username && profile.username.trim().toLowerCase() !== "user") {
            setUsername(profile.username);
            return;
        }

        const usernameSeedCandidates = [
            profile?.display_name,
            user?.user_metadata?.preferred_username,
            user?.user_metadata?.name,
            user?.email?.split("@")[0],
        ];

        const usernameSeed = usernameSeedCandidates.find((candidate) => {
            if (!candidate || typeof candidate !== "string") {
                return false;
            }

            return !isLikelyGeneratedDisplayName(candidate);
        });

        setUsername(suggestUsername(usernameSeed));
    }, [profile?.display_name, profile?.username, user?.email, user?.user_metadata]);

    useEffect(() => {
        const currentName = profile?.display_name?.trim();

        if (currentName && !isLikelyGeneratedDisplayName(currentName)) {
            setDisplayName(currentName);
            return;
        }

        setDisplayName("");
    }, [profile?.display_name, user]);

    const normalizedUsername = useMemo(
        () => normalizeUsername(username),
        [username]
    );
    const trimmedDisplayName = useMemo(() => displayName.trim(), [displayName]);
    const suggestedDisplayNamePlaceholder = useMemo(() => {
        const derivedName = deriveDisplayName(user, "").trim();
        return derivedName && !isLikelyGeneratedDisplayName(derivedName)
            ? derivedName
            : t("completeProfile.namePlaceholder");
    }, [t, user]);
    const validationMessage = getUsernameValidationMessage(username, t);
    const displayNameValidationMessage = null;
    const canSubmit =
        Boolean(user) &&
        !saving &&
        isValidUsername(username) &&
        trimmedDisplayName.length > 0;

    const handleContinue = async () => {
        if (!user || !canSubmit) {
            return;
        }

        setSaving(true);

        try {
            const { error } = await supabase
                .from("profiles")
                .update({
                    username: normalizedUsername,
                    display_name: trimmedDisplayName,
                })
                .eq("id", user.id);

            if (error) {
                if (error.code === "23505") {
                    Alert.alert(t("completeProfile.duplicateTitle"), t("completeProfile.duplicateBody"));
                    return;
                }

                throw error;
            }

            await refreshProfile();

            const { data: refreshedProfile, error: refreshError } = await supabase
                .from("profiles")
                .select("username, display_name")
                .eq("id", user.id)
                .maybeSingle();

            if (refreshError) {
                throw refreshError;
            }

            if (
                refreshedProfile?.username !== normalizedUsername ||
                refreshedProfile?.display_name?.trim() !== trimmedDisplayName
            ) {
                Alert.alert(
                    t("completeProfile.saveErrorTitle"),
                    t("completeProfile.saveErrorBody")
                );
                return;
            }

            router.replace("/");
        } catch (error: any) {
            Alert.alert(t("completeProfile.saveErrorTitle"), error.message || t("completeProfile.saveErrorBody"));
        } finally {
            setSaving(false);
        }
    };

    if (loading || !user) {
        return (
            <SafeAreaView style={styles.loadingScreen}>
                <ActivityIndicator size="large" color="#5FA893" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.screen}>
            <KeyboardAvoidingView
                style={styles.screen}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <View style={styles.content}>
                    <Text style={styles.kicker}>{t("completeProfile.kicker")}</Text>
                    <Text style={styles.title}>{t("completeProfile.title")}</Text>
                    <Text style={styles.description}>
                        {t("completeProfile.description")}
                    </Text>

                    <View style={styles.inputBlock}>
                        <Text style={styles.label}>{t("completeProfile.nameLabel")}</Text>
                        <TextInput
                            value={displayName}
                            onChangeText={setDisplayName}
                            autoCapitalize="words"
                            autoCorrect={false}
                            placeholder={suggestedDisplayNamePlaceholder}
                            placeholderTextColor="#9CA3AF"
                            style={styles.input}
                        />
                        <Text style={styles.helper}>
                            {displayNameValidationMessage || t("completeProfile.nameHelper")}
                        </Text>
                    </View>

                    <View style={styles.inputBlock}>
                        <Text style={styles.label}>{t("completeProfile.tryggdIdLabel")}</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            placeholder={t("completeProfile.tryggdIdPlaceholder")}
                            placeholderTextColor="#9CA3AF"
                            style={styles.input}
                        />
                        <Text style={styles.helper}>
                            {validationMessage || t("completeProfile.tryggdIdHelper")}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleContinue}
                        disabled={!canSubmit}
                        style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    >
                        <Text style={styles.buttonText}>
                            {saving ? t("completeProfile.saving") : t("completeProfile.continue")}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = {
    screen: {
        flex: 1,
        backgroundColor: "#F8FAFC",
    },
    loadingScreen: {
        flex: 1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: "#F8FAFC",
    },
    content: {
        flex: 1,
        justifyContent: "center" as const,
        paddingHorizontal: 24,
    },
    kicker: {
        color: "#5FA893",
        fontSize: iosFontSize(14),
        fontWeight: "700" as const,
        letterSpacing: 0.6,
        marginBottom: 12,
        textTransform: "uppercase" as const,
    },
    title: {
        color: "#0F172A",
        fontSize: iosFontSize(34),
        fontWeight: "800" as const,
        marginBottom: 12,
    },
    description: {
        color: "#475569",
        fontSize: iosFontSize(16),
        lineHeight: 24,
        marginBottom: 28,
    },
    inputBlock: {
        marginBottom: 24,
    },
    label: {
        color: "#0F172A",
        fontSize: iosFontSize(14),
        fontWeight: "600" as const,
        marginBottom: 8,
    },
    input: {
        backgroundColor: "#FFFFFF",
        borderColor: "#CBD5E1",
        borderRadius: 14,
        borderWidth: 1,
        color: "#0F172A",
        fontSize: iosFontSize(18),
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    helper: {
        color: "#64748B",
        fontSize: iosFontSize(13),
        marginTop: 10,
    },
    button: {
        alignItems: "center" as const,
        backgroundColor: "#5FA893",
        borderRadius: 14,
        paddingVertical: 16,
    },
    buttonDisabled: {
        backgroundColor: "#A8B5B0",
    },
    buttonText: {
        color: "#FFFFFF",
        fontSize: iosFontSize(16),
        fontWeight: "700" as const,
    },
};
