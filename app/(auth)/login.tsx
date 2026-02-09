// app/(auth)/login.tsx
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
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
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
        } catch (err: any) {
            Alert.alert(t("auth.login.error"), err.message || t("auth.unknownError"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>
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
                }}
            >
                <Text
                    style={{
                        color: "white",
                        textAlign: "center",
                        fontSize: 16,
                    }}
                >
                    {loading ? t("auth.login.loggingIn") : t("auth.login.signIn")}
                </Text>
            </TouchableOpacity>

            {/* Forgot password */}
            <Link href="/(auth)/forgot-password" style={{ marginTop: 16 }}>
                <Text style={{ textAlign: "center", color: "#5FA893" }}>
                    {t("auth.forgotPassword.title")}
                </Text>
            </Link>

            {/* Sign up link */}
            <Link href="/(auth)/signup" style={{ marginTop: 16 }}>
                <Text style={{ textAlign: "center", color: "#5FA893" }}>
                    {t("auth.noAccount")}
                </Text>
            </Link>
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
};