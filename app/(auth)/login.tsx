import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const { user, initialized } = useAuth();

    // Optional: Redirect if already logged in (handled by RootLayout)
    useEffect(() => {
        if (initialized && user) {
            console.log("[LoginScreen] User already logged in");
        }
    }, [user, initialized]);

    const signIn = async () => {
        if (!email || !password) {
            alert("Fyll i email och lösenord!");
            return;
        }

        setLoading(true);

        try {
            console.log("[DEBUG] Starting login:", email);

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            console.log("[DEBUG] Login successful:", data.user?.email);
            // RootLayout will redirect automatically

        } catch (err: any) {
            console.error("Login error:", err);
            alert(err.message || "Okänt fel vid inloggning");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>
                Tryggd
            </Text>

            {/* Email */}
            <TextInput
                placeholder="Email"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 12,
                }}
            />

            {/* Password with eye toggle */}
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
                    placeholder="Password"
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
                disabled={loading}
                style={{
                    backgroundColor: loading ? "#9CA3AF" : "#5FA893",
                    padding: 16,
                    borderRadius: 8,
                }}
            >
                <Text style={{ color: "white", textAlign: "center", fontSize: 16 }}>
                    {loading ? "Logging in..." : "Logga in"}
                </Text>
            </TouchableOpacity>

            {/* Signup link */}
            <Link href="/(auth)/signup" style={{ marginTop: 16 }}>
                <Text style={{ textAlign: "center", color: "#5FA893" }}>
                    Har du inget konto? Skapa ett
                </Text>
            </Link>

            {/* Debug button */}
            <TouchableOpacity
                onPress={async () => {
                    const { data: { session } } = await supabase.auth.getSession();
                    console.log("[DEBUG] Session check:", session?.user?.email);
                    console.log("[DEBUG] Auth context user:", user?.email);
                    console.log(
                        "[DEBUG] Current segments:",
                        require("expo-router").useSegments()
                    );
                }}
                style={{
                    backgroundColor: "gray",
                    padding: 10,
                    borderRadius: 8,
                    marginTop: 20,
                }}
            >
                <Text style={{ color: "white", textAlign: "center" }}>
                    Debug State
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}
