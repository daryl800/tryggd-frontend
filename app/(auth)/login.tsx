// app/(auth)/login.tsx
import { BaseColors } from "@/constants/colors";
import { signInWithSocial } from "@/lib/auth/oauth";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getDevicePreferredLanguage, LANGUAGE_STORAGE_KEY, resolveSupportedLanguage } from "../../i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveAuthEmailCandidates } from "@/lib/auth/phoneIdentity";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { iosFontSize } from '@/constants/typography';

export default function LoginScreen() {
    const { t, i18n } = useTranslation();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
    const passwordRef = useRef<TextInput>(null);

    useEffect(() => {
        const syncLoginLanguage = async () => {
            try {
                const deviceLanguage = getDevicePreferredLanguage();
                const currentLanguage = resolveSupportedLanguage(i18n.language);
                console.log('[LoginScreen] language sync', {
                    rawI18nLanguage: i18n.language,
                    currentLanguage,
                    deviceLanguage,
                });
                if (currentLanguage !== deviceLanguage) {
                    await i18n.changeLanguage(deviceLanguage);
                    console.log('[LoginScreen] changed language to', deviceLanguage);
                }
                await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, deviceLanguage);
            } catch (error) {
                console.error('Failed to sync login language', error);
            }
        };

        void syncLoginLanguage();
    }, [i18n]);

    const canSubmit = identifier && password.length >= 6 && !loading;

    const signIn = async () => {
        if (!canSubmit) return;

        setLoading(true);

        try {
            const authEmailCandidates = resolveAuthEmailCandidates(identifier);
            if (authEmailCandidates.length === 0) {
                throw new Error("Please enter a valid email or Tryggd ID.");
            }

            let signInError: Error | null = null;

            for (const authEmail of authEmailCandidates) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: authEmail,
                    password,
                });

                if (!error) {
                    signInError = null;
                    break;
                }

                signInError = error;
            }

            if (signInError) throw signInError;

        } catch (err: any) {
            Alert.alert(t("auth.login.error"), err.message || t("auth.unknownError"));
        } finally {
            setLoading(false);
        }
    };

    const signInWithProvider = async (provider: "google" | "apple") => {
        if (loading || socialLoading) return;

        setSocialLoading(provider);

        try {
            const result = await signInWithSocial(provider);
            if (result) {
                router.replace("/");
            }
        } catch (err: any) {
            Alert.alert(t("auth.login.socialError"), err.message || t("auth.unknownError"));
        } finally {
            setSocialLoading(null);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={{ padding: 24 }}>
                        <Text
                            style={{ fontSize: iosFontSize(32), fontWeight: "700", marginBottom: 24 }}
                            allowFontScaling={false}
                        >
                            {t("auth.login.title")}
                        </Text>

                        <View style={socialButtons}>
                            <TouchableOpacity
                                onPress={() => signInWithProvider("google")}
                                disabled={loading || socialLoading !== null}
                                style={socialButton}
                            >
                                <Ionicons name="logo-google" size={18} color="#111827" />
                                <Text style={socialButtonText} allowFontScaling={false}>
                                    {socialLoading === "google" ? t("auth.login.connectingToGoogle") : t("auth.login.continueWithGoogle")}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => signInWithProvider("apple")}
                                disabled={loading || socialLoading !== null}
                                style={socialButton}
                            >
                                <Ionicons name="logo-apple" size={20} color="#111827" />
                                <Text style={socialButtonText} allowFontScaling={false}>
                                    {socialLoading === "apple" ? t("auth.login.connectingToApple") : t("auth.login.continueWithApple")}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={dividerRow}>
                            <View style={dividerLine} />
                            <Text style={dividerText} allowFontScaling={false}>
                                {t("auth.login.orContinueWithIdentifier", { defaultValue: "or continue with Email or Tryggd ID" })}
                            </Text>
                            <View style={dividerLine} />
                        </View>

                        {/* Email or Tryggd ID */}
                        <TextInput
                            placeholder={t("auth.login.identifierPlaceholder", { defaultValue: "Email or Tryggd ID" })}
                            placeholderTextColor={BaseColors.placeholderTextColor}
                            autoCapitalize="none"
                            keyboardType="default"
                            value={identifier}
                            onChangeText={setIdentifier}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            style={inputStyle}
                            allowFontScaling={false}
                        />

                        {/* Password */}
                        <View style={passwordWrapper}>
                            <TextInput
                                ref={passwordRef}
                                placeholder={t("auth.password.placeholder")}
                                placeholderTextColor={BaseColors.placeholderTextColor}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                style={passwordInput}
                                allowFontScaling={false}
                            />
                            {password.length > 0 && (
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons
                                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                                        size={22}
                                        color="#6B7280"
                                    />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Login button */}
                        <TouchableOpacity
                            onPress={signIn}
                            disabled={!canSubmit}
                            style={{
                                backgroundColor: canSubmit ? "#5FA893" : "#9CA3AF",
                                padding: 16,
                                borderRadius: 8,
                                marginTop: 8,
                                marginBottom: 16,
                            }}
                        >
                            <Text
                                style={{
                                    color: "white",
                                    textAlign: "center",
                                    fontSize: iosFontSize(16),
                                    fontWeight: "600",
                                }}
                                allowFontScaling={false}
                            >
                                {loading ? t("auth.login.loggingIn") : t("auth.login.signIn")}
                            </Text>
                        </TouchableOpacity>

                        {/* Forgot password */}
                        <Link href="/(auth)/forgot-password" style={{ marginBottom: 12 }}>
                            <Text
                                style={{ textAlign: "center", color: "#5FA893", fontSize: iosFontSize(15) }}
                                allowFontScaling={false}
                            >
                                {t("auth.forgotPassword.title")}
                            </Text>
                        </Link>

                        <Link href="/(auth)/invite-code" asChild>
                            <TouchableOpacity style={invitePanel}>
                                <View style={invitePanelCopy}>
                                    <Text style={inviteTitle} allowFontScaling={false}>
                                        {t("auth.login.useInviteCode", { defaultValue: "Have an invite code?" })}
                                    </Text>
                                    <Text style={inviteSubtitle} allowFontScaling={false}>
                                        {t("auth.invite.enterCodeStandaloneHint", {
                                            defaultValue: "If you installed the app after receiving an invite, enter the 6-digit code to continue.",
                                        })}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={22} color={BaseColors.primaryDark} />
                            </TouchableOpacity>
                        </Link>

                        {/* Sign up link */}
                        <Link href="/(auth)/signup" style={{ marginBottom: 20 }}>
                            <Text
                                style={{ textAlign: "center", color: "#5FA893", fontSize: iosFontSize(15) }}
                                allowFontScaling={false}
                            >
                                {t("auth.noAccount")}
                            </Text>
                        </Link>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

/* ---------- styles ---------- */
const inputStyle = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: iosFontSize(16),
    color: "#1F2937",
};

const passwordWrapper = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
};

const passwordInput = {
    flex: 1,
    paddingVertical: 12,
    fontSize: iosFontSize(16),
    color: "#1F2937",
};

const socialButtons = {
    gap: 12,
    marginBottom: 24,
};

const socialButton = {
    alignItems: "center" as const,
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 10,
    justifyContent: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
};

const socialButtonText = {
    color: "#111827",
    fontSize: iosFontSize(15),
    fontWeight: "600" as const,
};

const dividerRow = {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    marginBottom: 20,
};

const dividerLine = {
    backgroundColor: "#E5E7EB",
    flex: 1,
    height: StyleSheet.hairlineWidth,
};

const dividerText = {
    color: "#6B7280",
    fontSize: iosFontSize(13),
};

const invitePanel = {
    alignItems: "center" as const,
    backgroundColor: BaseColors.primaryLight,
    borderColor: BaseColors.primaryBorder,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: 16,
    padding: 18,
};

const invitePanelCopy = {
    flex: 1,
    paddingRight: 12,
};

const inviteTitle = {
    color: BaseColors.text.dark,
    fontSize: iosFontSize(20),
    fontWeight: "700" as const,
    marginBottom: 8,
};

const inviteSubtitle = {
    color: BaseColors.text.muted,
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(20),
    marginBottom: 14,
};
