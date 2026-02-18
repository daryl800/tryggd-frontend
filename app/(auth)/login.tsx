// app/(auth)/login.tsx
import { registerAndSavePushToken } from "@/lib/notifications/core";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const passwordRef = useRef<TextInput>(null);

    const canSubmit = email && password.length >= 6 && !loading;

    const signIn = async () => {
        if (!canSubmit) return;

        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            const user = data.user;
            if (!user) return;

            // ✅ ONLY register push token, NO sending from client
            await registerAndSavePushToken(user.id);

        } catch (err: any) {
            Alert.alert(t("auth.login.error"), err.message || t("auth.unknownError"));
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
                            style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}
                            allowFontScaling={false}
                        >
                            {t("auth.login.title")}
                        </Text>

                        {/* Email */}
                        <TextInput
                            placeholder={t("auth.email")}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                            style={inputStyle}
                            allowFontScaling={false}
                            placeholderTextColor="#9CA3AF"
                        />

                        {/* Password */}
                        <View style={passwordWrapper}>
                            <TextInput
                                ref={passwordRef}
                                placeholder={t("auth.password.placeholder")}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                style={passwordInput}
                                allowFontScaling={false}
                                placeholderTextColor="#9CA3AF"
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
                                    fontSize: 16,
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
                                style={{ textAlign: "center", color: "#5FA893", fontSize: 15 }}
                                allowFontScaling={false}
                            >
                                {t("auth.forgotPassword.title")}
                            </Text>
                        </Link>

                        {/* Sign up link */}
                        <Link href="/(auth)/signup" style={{ marginBottom: 20 }}>
                            <Text
                                style={{ textAlign: "center", color: "#5FA893", fontSize: 15 }}
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
    fontSize: 16,
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
    fontSize: 16,
    color: "#1F2937",
};