import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
    Alert,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function SignupScreen() {
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
                    emailRedirectTo: "http://localhost:3000",
                },
            });

            if (error) throw error;
            if (!data.user) throw new Error("Signup failed");

            await supabase.from("profiles").insert({
                id: data.user.id,
                display_name: displayName,
                avatar_url: "",
            });

            Alert.alert(
                "Konto skapat 🎉",
                "Ditt konto är klart. Du kan nu logga in."
            );
        } catch (err: any) {
            Alert.alert("Fel", err.message || "Okänt fel");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>
                Skapa konto
            </Text>

            {/* Name */}
            <TextInput
                placeholder="Namn"
                value={displayName}
                onChangeText={setDisplayName}
                style={inputStyle}
            />

            {/* Email */}
            <TextInput
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={inputStyle}
            />

            {/* Password */}
            <View style={passwordWrapper}>
                <TextInput
                    placeholder="Lösenord (minst 6 tecken)"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={() => confirmRef.current?.focus()}
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

            {/* Confirm password */}
            <View style={passwordWrapper}>
                <TextInput
                    ref={confirmRef}
                    placeholder="Bekräfta lösenord"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    style={passwordInput}
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
                >
                    {passwordsMatch
                        ? "✔ Lösenorden matchar"
                        : "✖ Lösenorden matchar inte"}
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
                }}
            >
                <Text
                    style={{
                        color: "white",
                        textAlign: "center",
                        fontSize: 16,
                    }}
                >
                    {loading ? "Skapar konto..." : "Skapa konto"}
                </Text>
            </TouchableOpacity>

            {/* Back to login */}
            <Link href="/(auth)/login" style={{ marginTop: 16 }}>
                <Text style={{ textAlign: "center", color: "#5FA893" }}>
                    Har du redan ett konto? Logga in
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
