import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function SignupScreen() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [loading, setLoading] = useState(false);

    const signUp = async () => {
        if (!email || !password || !displayName) {
            Alert.alert("Fel", "Fyll i namn, email och lösenord!");
            return;
        }

        setLoading(true);

        try {
            // 1️⃣ Sign up user with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: "http://localhost:3000", // dev mode, skip email confirmation
                },
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Signup failed");

            const userId = authData.user.id;

            // 2️⃣ Create profile row in `profiles` table
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .insert({
                    id: userId,
                    display_name: displayName,
                    avatar_url: "", // optional
                });

            if (profileError) throw profileError;

            // 3️⃣ Show success alert and navigate
            Alert.alert(
                "Konto skapat!",
                "Användaren har skapats. Du kan logga in direkt (test mode)."
            );

            // Optional: automatically navigate to home page
            // router.push("/(tabs)");

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
                placeholder="Lösenord"
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
                onPress={signUp}
                disabled={loading}
                style={{
                    backgroundColor: "#5FA893",
                    padding: 16,
                    borderRadius: 8,
                }}
            >
                <Text style={{ color: "white", textAlign: "center", fontSize: 16 }}>
                    {loading ? "Skapar konto..." : "Skapa konto"}
                </Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}
