// app/(auth)/login.tsx
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { user, initialized } = useAuth();

    // Optional: Redirect if already logged in (but root layout should handle this)
    useEffect(() => {
        if (initialized && user) {
            console.log("[LoginScreen] User already logged in");
            // Don't navigate here - let root layout handle it
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

            // DO NOT NAVIGATE HERE
            // The AuthContext will update and RootLayout will redirect

        } catch (err: any) {
            console.error("Login error:", err);
            alert(err.message || "Okänt fel vid inloggning");
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, padding: 24 }}>
            <Text style={{ fontSize: 32, fontWeight: "700", marginBottom: 24 }}>Tryggd</Text>

            <TextInput
                placeholder="Email"
                autoCapitalize="none"
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

            <TextInput
                placeholder="Password"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 24,
                }}
            />

            <TouchableOpacity
                onPress={signIn}
                disabled={loading}
                style={{
                    backgroundColor: "#5FA893",
                    padding: 16,
                    borderRadius: 8,
                }}
            >
                <Text style={{ color: "white", textAlign: "center", fontSize: 16 }}>
                    {loading ? "Logging in..." : "Logga in"}
                </Text>
            </TouchableOpacity>

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
                    console.log("[DEBUG] Current segments:", require("expo-router").useSegments());
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