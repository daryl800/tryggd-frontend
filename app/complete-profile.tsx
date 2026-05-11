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

export default function CompleteProfileScreen() {
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
            router.replace("/(tabs)");
        }
    }, [user, loading, needsUsername]);

    useEffect(() => {
        if (profile?.username) {
            setUsername(profile.username);
            return;
        }

        setUsername(
            suggestUsername(
                profile?.display_name ||
                user?.user_metadata?.preferred_username ||
                user?.user_metadata?.name ||
                user?.email?.split("@")[0]
            )
        );
    }, [profile?.display_name, profile?.username, user?.email, user?.user_metadata]);

    useEffect(() => {
        const currentName = profile?.display_name?.trim();

        if (currentName && !isLikelyGeneratedDisplayName(currentName)) {
            setDisplayName(currentName);
            return;
        }

        const suggestedName = deriveDisplayName(user, "");
        setDisplayName(isLikelyGeneratedDisplayName(suggestedName) ? "" : suggestedName);
    }, [profile?.display_name, user]);

    const normalizedUsername = useMemo(
        () => normalizeUsername(username),
        [username]
    );
    const trimmedDisplayName = useMemo(() => displayName.trim(), [displayName]);
    const validationMessage = getUsernameValidationMessage(username);
    const displayNameValidationMessage =
        trimmedDisplayName.length === 0 ? "Enter the name you want people to see." : "";
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
                    Alert.alert("Try another Tryggd ID", "That Tryggd ID is already taken.");
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
                    "Could not save profile",
                    "Your profile could not be updated. Please try again."
                );
                return;
            }

            router.replace("/(tabs)");
        } catch (error: any) {
            Alert.alert("Could not save profile", error.message || "Please try again.");
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
                    <Text style={styles.kicker}>One more step</Text>
                    <Text style={styles.title}>Complete your profile</Text>
                    <Text style={styles.description}>
                        Add the name people will see and your Tryggd ID for contact search.
                    </Text>

                    <View style={styles.inputBlock}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                            value={displayName}
                            onChangeText={setDisplayName}
                            autoCapitalize="words"
                            autoCorrect={false}
                            placeholder="e.g. Daryl Ng"
                            placeholderTextColor="#9CA3AF"
                            style={styles.input}
                        />
                        <Text style={styles.helper}>
                            {displayNameValidationMessage || "This is the name your contacts will see."}
                        </Text>
                    </View>

                    <View style={styles.inputBlock}>
                        <Text style={styles.label}>Tryggd ID</Text>
                        <TextInput
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            placeholder="e.g. daryl.tryggd"
                            placeholderTextColor="#9CA3AF"
                            style={styles.input}
                        />
                        <Text style={styles.helper}>
                            {validationMessage || "Use 3-24 lowercase letters, numbers, dots, or underscores."}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={handleContinue}
                        disabled={!canSubmit}
                        style={[styles.button, !canSubmit && styles.buttonDisabled]}
                    >
                        <Text style={styles.buttonText}>
                            {saving ? "Saving..." : "Continue"}
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
        fontSize: 14,
        fontWeight: "700" as const,
        letterSpacing: 0.6,
        marginBottom: 12,
        textTransform: "uppercase" as const,
    },
    title: {
        color: "#0F172A",
        fontSize: 34,
        fontWeight: "800" as const,
        marginBottom: 12,
    },
    description: {
        color: "#475569",
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 28,
    },
    inputBlock: {
        marginBottom: 24,
    },
    label: {
        color: "#0F172A",
        fontSize: 14,
        fontWeight: "600" as const,
        marginBottom: 8,
    },
    input: {
        backgroundColor: "#FFFFFF",
        borderColor: "#CBD5E1",
        borderRadius: 14,
        borderWidth: 1,
        color: "#0F172A",
        fontSize: 18,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    helper: {
        color: "#64748B",
        fontSize: 13,
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
        fontSize: 16,
        fontWeight: "700" as const,
    },
};
