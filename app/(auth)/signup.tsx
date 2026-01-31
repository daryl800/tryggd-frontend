import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
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
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [displayName, setDisplayName] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [loading, setLoading] = useState(false);

    const signUp = async () => {
        if (!displayName || !email || !password || !confirmPassword) {
            Alert.alert("Fel", "Fyll i namn, email och lösenord!");
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert("Fel", "Lösenorden matchar inte");
            return;
        }

        if (password.length < 6) {
            Alert.alert("Fel", "Lösenordet måste vara minst 6 tecken");
            return;
        }

        setLoading(true);

        try {
            // 1️⃣ Supabase signup
            const { data: authData, error: authError } =
                await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: "http://localhost:3000", // dev mode
                    },
                });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Signup failed");

            const userId = authData.user.id;

            // 2️⃣ Create profile
            const { error: profileError } = await supabase
                .from("profiles")
                .insert({
                    id: userId,
                    display_name: displayName,
                    avatar_url: "",
                });

            if (profileError) throw profileError;

            Alert.alert(
                "Konto skapat!",
                "Ditt konto har skapats. Du kan nu logga in."
            );

        } catch (err: any) {
            console.error("Signup error:", err);
            Alert.alert("Fel vid registrering", err.message || "Okänt fel");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>
                Skapa konto
            </Text>

            {/* Display name */}
            <TextInput
                placeholder="Namn"
                value={displayName}
                onChangeText={setDisplayName}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 12,
                }}
            />

            {/* Email */}
            <TextInput
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 12,
                }}
            />

            {/* Password */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    marginBottom: 12,
                }}
            >
                <TextInput
                    placeholder="Lösenord"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    style={{
                        flex: 1,
                        paddingVertical: 12,
                    }}
                />

                {password.length > 0 && (
                    <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons
                            name={
                                showPassword
                                    ? "eye-off-outline"
                                    : "eye-outline"
                            }
                            size={22}
                            color="#6B7280"
                        />
                    </TouchableOpacity>
                )}
            </View>

            {/* Confirm password */}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    marginBottom: 24,
                }}
            >
                <TextInput
                    placeholder="Bekräfta lösenord"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    style={{
                        flex: 1,
                        paddingVertical: 12,
                    }}
                />

                {confirmPassword.length > 0 && (
                    <TouchableOpacity
                        onPress={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                        }
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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

            {/* Signup button */}
            <TouchableOpacity
                onPress={signUp}
                disabled={loading}
                style={{
                    backgroundColor: loading ? "#9CA3AF" : "#5FA893",
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
        </SafeAreaView>
    );
}
