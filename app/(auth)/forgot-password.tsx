import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordScreen() {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!email) return;
        setLoading(true);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: "tryggd://auth/reset-password",
            });
            if (error) throw error;

            Alert.alert(
                t("auth.forgotPassword.sentTitle"),
                t("auth.forgotPassword.sentMessage")
            );
        } catch (err: any) {
            Alert.alert(t("auth.forgotPassword.error"), err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 24, marginBottom: 16 }}>
                {t("auth.forgotPassword.title")}
            </Text>

            <TextInput
                placeholder={t("auth.email")}
                value={email}
                onChangeText={setEmail}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                }}
                keyboardType="email-address"
                autoCapitalize="none"
            />

            <TouchableOpacity
                onPress={submit}
                disabled={!email || loading}
                style={{
                    backgroundColor: email ? "#5FA893" : "#9CA3AF",
                    padding: 16,
                    borderRadius: 8,
                    marginTop: 16,
                }}
            >
                <Text style={{ color: "white", textAlign: "center" }}>
                    {loading
                        ? t("auth.forgotPassword.sending")
                        : t("auth.forgotPassword.send")}
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}
