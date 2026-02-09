// /auth/reset-password.tsx
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, TouchableOpacity } from "react-native";
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
            }, token); // token required for reset
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
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 24, marginBottom: 16 }}>
                {t("auth.resetPassword.title")}
            </Text>

            <TextInput
                placeholder={t("auth.password.placeholder")}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 12,
                }}
            />

            <TextInput
                placeholder={t("auth.confirmPassword")}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 12,
                }}
            />

            <TouchableOpacity
                onPress={submit}
                disabled={!passwordsMatch || loading}
                style={{
                    backgroundColor: passwordsMatch ? "#5FA893" : "#9CA3AF",
                    padding: 16,
                    borderRadius: 8,
                }}
            >
                <Text style={{ color: "white", textAlign: "center" }}>
                    {loading ? t("auth.resetPassword.saving") : t("auth.resetPassword.save")}
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}
