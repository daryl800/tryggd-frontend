// app/(auth)/reset-password.tsx
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordScreen() {
    const { t } = useTranslation();
    const router = useRouter();

    const [token, setToken] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const passwordsMatch = password && confirmPassword && password === confirmPassword;

    // Grab token from deep link
    useEffect(() => {
        const getTokenFromLink = async () => {
            const initialUrl = await Linking.getInitialURL();
            if (!initialUrl) return;

            const parsed = Linking.parse(initialUrl);
            const accessToken = parsed.queryParams?.access_token as string | undefined;
            if (accessToken) setToken(accessToken);
        };

        getTokenFromLink();
    }, []);

    const submit = async () => {
        if (!passwordsMatch || !token) return;

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password,
            }); // Note: token handling might be different - check your Supabase version

            if (error) throw error;

            Alert.alert(
                t("auth.resetPassword.successTitle"),
                t("auth.resetPassword.successMessage"),
                [
                    {
                        text: t("auth.resetPassword.login"),
                        onPress: () => router.replace("/(auth)/login"),
                    },
                ]
            );
        } catch (err: any) {
            Alert.alert(t("auth.resetPassword.error"), err.message);
        } finally {
            setLoading(false);
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
                            style={{ fontSize: 28, fontWeight: "700", marginBottom: 12 }}
                            allowFontScaling={false}
                        >
                            {t("auth.resetPassword.title")}
                        </Text>

                        <Text
                            style={{
                                fontSize: 15,
                                color: "#6B7280",
                                marginBottom: 24,
                                lineHeight: 20
                            }}
                            allowFontScaling={false}
                        >
                            {t("auth.resetPassword.instructions")}
                        </Text>

                        <TextInput
                            placeholder={t("auth.password.placeholder")}
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            style={inputStyle}
                            allowFontScaling={false}
                            placeholderTextColor="#9CA3AF"
                        />

                        <TextInput
                            placeholder={t("auth.confirmPassword")}
                            secureTextEntry
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            style={inputStyle}
                            allowFontScaling={false}
                            placeholderTextColor="#9CA3AF"
                        />

                        {confirmPassword.length > 0 && (
                            <Text
                                style={{
                                    marginBottom: 16,
                                    color: passwordsMatch ? "#059669" : "#DC2626",
                                    fontSize: 14,
                                }}
                                allowFontScaling={false}
                            >
                                {passwordsMatch
                                    ? t("auth.passwordsMatch")
                                    : t("auth.passwordsNoMatch")}
                            </Text>
                        )}

                        <TouchableOpacity
                            onPress={submit}
                            disabled={!passwordsMatch || loading}
                            style={{
                                backgroundColor: passwordsMatch ? "#5FA893" : "#9CA3AF",
                                padding: 16,
                                borderRadius: 8,
                                marginTop: 8,
                                marginBottom: 20,
                            }}
                        >
                            <Text
                                style={{
                                    color: "white",
                                    textAlign: "center",
                                    fontSize: 16,
                                    fontWeight: "600"
                                }}
                                allowFontScaling={false}
                            >
                                {loading ? t("auth.resetPassword.saving") : t("auth.resetPassword.save")}
                            </Text>
                        </TouchableOpacity>
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
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 16,
    color: "#1F2937",
};