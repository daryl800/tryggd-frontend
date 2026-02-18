// app/(auth)/signup.tsx
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
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

export default function SignupScreen() {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const confirmRef = useRef<TextInput>(null);

    const passwordsMatch =
        password.length > 0 &&
        confirmPassword.length > 0 &&
        password === confirmPassword;

    const canSubmit =
        displayName &&
        email &&
        password.length >= 6 &&
        passwordsMatch &&
        !loading;

    const signUp = async () => {
        if (!canSubmit) return;

        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: "https://tryggd.se/signup-email-confirmation",
                },
            });

            if (error) throw error;
            if (!data.user) throw new Error(t("auth.signup.error"));

            await supabase.from("profiles").insert({
                id: data.user.id,
                display_name: displayName,
                avatar_url: "",
            });

            Alert.alert(
                t("auth.signup.verifyEmail.title"),
                t("auth.signup.verifyEmail.message"),
                [
                    {
                        text: "OK",
                        onPress: () => router.replace("/(auth)/login"),
                    },
                ]
            );


        } catch (err: any) {
            Alert.alert(t("auth.signup.error"), err.message || t("auth.unknownError"));
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
                        <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>
                            {t("auth.signup.title")}
                        </Text>

                        {/* Name */}
                        <TextInput
                            placeholder={t("auth.displayName")}
                            value={displayName}
                            onChangeText={setDisplayName}
                            style={inputStyle}
                            allowFontScaling={false}
                        />

                        {/* Email */}
                        <TextInput
                            placeholder={t("auth.email")}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                            style={inputStyle}
                            allowFontScaling={false}
                        />

                        {/* Password */}
                        <View style={passwordWrapper}>
                            <TextInput
                                placeholder={t("auth.password.placeholder")}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                onSubmitEditing={() => confirmRef.current?.focus()}
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

                        {/* Confirm password */}
                        <View style={passwordWrapper}>
                            <TextInput
                                ref={confirmRef}
                                placeholder={t("auth.confirmPassword")}
                                secureTextEntry={!showConfirmPassword}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                style={passwordInput}
                                allowFontScaling={false}
                            />
                            {confirmPassword.length > 0 && (
                                <TouchableOpacity
                                    onPress={() =>
                                        setShowConfirmPassword(!showConfirmPassword)
                                    }
                                >
                                    <Ionicons
                                        name={
                                            showConfirmPassword
                                                ? "eye-off-outline"
                                                : "eye-outline"
                                        }
                                        size={22}
                                        color="#6B7280"
                                    />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Live feedback */}
                        {confirmPassword.length > 0 && (
                            <Text
                                style={{
                                    marginBottom: 16,
                                    color: passwordsMatch ? "#059669" : "#DC2626",
                                }}
                                allowFontScaling={false}
                            >
                                {passwordsMatch
                                    ? t("auth.passwordsMatch")
                                    : t("auth.passwordsNoMatch")}
                            </Text>
                        )}

                        {/* Signup button */}
                        <TouchableOpacity
                            onPress={signUp}
                            disabled={!canSubmit}
                            style={{
                                backgroundColor: canSubmit ? "#5FA893" : "#9CA3AF",
                                padding: 16,
                                borderRadius: 8,
                                marginBottom: 16,
                            }}
                        >
                            <Text
                                style={{
                                    color: "white",
                                    textAlign: "center",
                                    fontSize: 16,
                                }}
                                allowFontScaling={false}
                            >
                                {loading ? t("auth.signup.creating") : t("auth.signup.create")}
                            </Text>
                        </TouchableOpacity>

                        {/* Back to login */}
                        <Link href="/(auth)/login" style={{ marginBottom: 20 }}>
                            <Text style={{ textAlign: "center", color: "#5FA893" }} allowFontScaling={false}>
                                {t("auth.alreadyHaveAccount")}
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
};