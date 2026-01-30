import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type ContactSlot = {
    email: string;       // optional display
    user_id?: string;    // required for saving
    display_name?: string;
};

export default function ContactsScreen() {
    const router = useRouter();
    const [contacts, setContacts] = useState<ContactSlot[]>([
        { email: "" },
        { email: "" },
        { email: "" },
    ]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) throw userError;
            const user = userData.user;
            if (!user) return;

            // Fetch contact user_ids
            const { data: contactRows, error: contactError } = await supabase
                .from("contacts")
                .select("contact_user_id")
                .eq("owner_user_id", user.id)
                .order("created_at")
                .limit(3);

            if (contactError) throw contactError;

            // Fetch profile info for each contact
            const mapped: ContactSlot[] = [{ email: "" }, { email: "" }, { email: "" }];
            if (contactRows?.length) {
                for (let i = 0; i < contactRows.length; i++) {
                    const uid = contactRows[i].contact_user_id;
                    const { data: profile, error: profileError } = await supabase
                        .from("profiles")
                        .select("email, display_name")
                        .eq("id", uid)
                        .single();

                    mapped[i] = {
                        user_id: uid,
                        email: profile?.email ?? "",
                        display_name: profile?.display_name ?? "••••••••",
                    };
                }
            }

            setContacts(mapped);
        } catch (e: any) {
            console.error(e);
            Alert.alert("Error", "Failed to load contacts");
        } finally {
            setLoading(false);
        }
    };

    const updateContactSlot = (index: number, email: string) => {
        const updated = [...contacts];
        updated[index] = { ...updated[index], email };
        setContacts(updated);
    };

    const saveContacts = async () => {
        setLoading(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error("Not authenticated");

            // Resolve emails → user_ids
            const resolved: ContactSlot[] = [];
            for (const c of contacts) {
                if (!c.email.trim()) continue;

                const { data: profile, error } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("email", c.email.trim())
                    .single();

                if (error || !profile) {
                    Alert.alert("Invalid email", `${c.email} is not registered`);
                    return;
                }

                resolved.push({ user_id: profile.id, email: c.email.trim() });
            }

            // Delete old contacts and insert new
            await supabase
                .from("contacts")
                .delete()
                .eq("owner_user_id", user.id);

            if (resolved.length) {
                await supabase.from("contacts").insert(
                    resolved.map((c) => ({
                        owner_user_id: user.id,
                        contact_user_id: c.user_id,
                    }))
                );
            }

            Alert.alert("Saved", "Contacts updated");
            fetchContacts();
        } catch (e: any) {
            console.error(e);
            Alert.alert("Error", e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}
        >
            <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 24 }}>
                Kontakter
            </Text>

            <ScrollView style={{ flex: 1 }}>
                {contacts.map((c, idx) => (
                    <View
                        key={idx}
                        style={{
                            backgroundColor: "#F9FAFB",
                            borderRadius: 16,
                            padding: 16,
                            marginBottom: 16,
                        }}
                    >
                        <Text style={{ fontSize: 16, marginBottom: 8 }}>
                            Kontakt e-post {idx + 1}
                        </Text>
                        <TextInput
                            placeholder="example@mail.com"
                            value={c.email}
                            onChangeText={(text) => updateContactSlot(idx, text)}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            style={{
                                backgroundColor: "#fff",
                                borderRadius: 12,
                                padding: 12,
                                fontSize: 16,
                            }}
                        />
                        {c.display_name && (
                            <Text style={{ marginTop: 4, fontSize: 14, color: "#6B7280" }}>
                                {c.display_name}
                            </Text>
                        )}
                    </View>
                ))}
            </ScrollView>

            <TouchableOpacity
                disabled={loading}
                onPress={saveContacts}
                style={{
                    marginTop: 16,
                    backgroundColor: "#5FA893",
                    padding: 16,
                    borderRadius: 14,
                    alignItems: "center",
                }}
            >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                    {loading ? "Sparar..." : "Spara kontakter"}
                </Text>
            </TouchableOpacity>

            {/* Bottom Navigation */}
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                    marginTop: "auto",
                    paddingVertical: 16,
                    borderTopWidth: 1,
                    borderTopColor: "#F3F4F6",
                }}
            >
                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)")}
                >
                    <Ionicons name="home-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Hem</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)/activities")}
                >
                    <Ionicons name="list-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Aktivitet</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)/contacts")}
                >
                    <Ionicons name="people" size={24} color="#5FA893" />
                    <Text style={{ fontSize: 12, color: "#5FA893", marginTop: 4 }}>Kontakter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={{ alignItems: "center" }}
                    onPress={() => router.push("/(tabs)/profile")}
                >
                    <Ionicons name="person-outline" size={24} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Profil</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}
