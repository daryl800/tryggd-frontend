// app/(auth)/forgot-password.tsx
import { BaseColors } from "@/constants/colors";
import { router } from "expo-router";
import { useState } from "react";
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
import { iosFontSize } from '@/constants/typography';

export default function ForgotPasswordScreen() {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (!email) return;
        setLoading(true);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: "https://tryggd.com/reset-password",
            });
            if (error) throw error;

            Alert.alert(
                t("auth.forgotPassword.sentTitle"),
                t("auth.forgotPassword.sentMessage"),
                [
                    {
                        text: "OK",
                        onPress: () => router.replace("/(auth)/login")
                    }
                ]
            );
        } catch (err: any) {
            Alert.alert(t("auth.forgotPassword.error"), err.message);
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
                        <Text style={{ fontSize: iosFontSize(32), fontWeight: "700", marginBottom: 24 }}>
                            {t("auth.forgotPassword.title")}
                        </Text>

                        <Text
                            style={{
                                fontSize: iosFontSize(15),
                                color: "#6B7280",
                                marginBottom: 24,
                                lineHeight: 20
                            }}
                        >
                            {t("auth.forgotPassword.instructions")}
                        </Text>

                        <TextInput
                            placeholder={t("auth.email")}
                            placeholderTextColor={BaseColors.placeholderTextColor}
                            value={email}
                            onChangeText={setEmail}
                            style={inputStyle}
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
                                marginBottom: 20,
                            }}
                        >
                            <Text
                                style={{
                                    color: "white",
                                    textAlign: "center",
                                    fontSize: iosFontSize(16),
                                    fontWeight: "600"
                                }}
                            >
                                {loading
                                    ? t("auth.forgotPassword.sending")
                                    : t("auth.forgotPassword.send")}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
                            <Text style={{ textAlign: "center", color: "#5FA893" }}>
                                {t("auth.forgotPassword.login")}
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
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: iosFontSize(16),
    color: "#1F2937",
};
