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
    email: string;       // email input/search value
    user_id?: string;    // resolved user ID
    display_name?: string; // resolved display name
};

// Add this interface for the RPC response
interface UserSearchResult {
    user_id: string;
    email: string;
    display_name: string;
}

export default function ContactsScreen() {
    const [contacts, setContacts] = useState<ContactSlot[]>([
        { email: "" },
        { email: "" },
        { email: "" },
    ]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

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

            // Fetch contacts with stored email and display name
            const { data: contactRows, error } = await supabase
                .from("contacts")
                .select("contact_user_id, contact_email, contact_display_name")
                .eq("owner_user_id", user.id)
                .order("created_at")
                .limit(3);

            if (error) throw error;

            // Initialize with 3 empty slots
            const mapped: ContactSlot[] = [
                { email: "" },
                { email: "" },
                { email: "" }
            ];

            // Fill with actual contacts
            if (contactRows?.length) {
                for (let i = 0; i < contactRows.length; i++) {
                    mapped[i] = {
                        user_id: contactRows[i].contact_user_id,
                        email: contactRows[i].contact_email || "",
                        display_name: contactRows[i].contact_display_name || "",
                    };
                }
            }

            setContacts(mapped);
        } catch (e: any) {
            console.error("Fetch contacts error:", e);
            Alert.alert("Error", "Failed to load contacts");
        } finally {
            setLoading(false);
        }
    };

    const updateContactSlot = (index: number, email: string) => {
        const updated = [...contacts];
        updated[index] = { ...updated[index], email, display_name: undefined, user_id: undefined };
        setContacts(updated);
    };

    const saveContacts = async () => {
        setSaving(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error("Not authenticated");

            // Resolve emails → user_ids
            const resolved: ContactSlot[] = [];

            for (const c of contacts) {
                const emailToSearch = c.email.trim();
                console.log("[ContactsScreen] Searching for email:", emailToSearch);

                if (!emailToSearch) continue;

                // Use the RPC function to search for user by email with proper typing
                const { data: userResult, error } = await supabase
                    .rpc('find_contact_by_email', {
                        search_email: emailToSearch
                    })
                    .single() as { data: UserSearchResult | null; error: any };

                console.log("[ContactsScreen] User search result:", { userResult, error });

                if (error) {
                    console.error("[ContactsScreen] Database error:", error);
                    Alert.alert("Database error", "Could not search for user");
                    return;
                }

                if (!userResult) {
                    Alert.alert("Invalid email", `${emailToSearch} is not registered or not verified`);
                    return;
                }

                // Prevent adding yourself as a contact
                if (userResult.user_id === user.id) {
                    Alert.alert("Invalid contact", "You cannot add yourself as a contact");
                    return;
                }

                resolved.push({
                    user_id: userResult.user_id,
                    email: userResult.email,
                    display_name: userResult.display_name
                });
            }

            // Delete old contacts
            const { error: deleteError } = await supabase
                .from("contacts")
                .delete()
                .eq("owner_user_id", user.id);

            if (deleteError) {
                console.error("[ContactsScreen] Delete error:", deleteError);
                throw deleteError;
            }

            // Insert new contacts WITH email and display name
            if (resolved.length) {
                const { error: insertError } = await supabase
                    .from("contacts")
                    .insert(
                        resolved.map((c) => ({
                            owner_user_id: user.id,
                            contact_user_id: c.user_id,
                            contact_email: c.email,           // Store email
                            contact_display_name: c.display_name || "", // Store display name
                            created_at: new Date().toISOString(),
                        }))
                    );

                if (insertError) {
                    console.error("[ContactsScreen] Insert error:", insertError);
                    throw insertError;
                }
            }

            Alert.alert("Saved", "Contacts updated successfully");

            // Update the state with what we saved
            const updatedContacts = [...resolved];
            // Fill remaining slots with empty objects
            while (updatedContacts.length < 3) {
                updatedContacts.push({ email: "" });
            }
            setContacts(updatedContacts);
        } catch (e: any) {
            console.error("Save contacts error:", e);
            Alert.alert("Error", e.message || "Failed to save contacts");
        } finally {
            setSaving(false);
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
                {loading ? (
                    <Text style={{ textAlign: "center", padding: 20 }}>Laddar kontakter...</Text>
                ) : (
                    contacts.map((c, idx) => (
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
                            {/* Show display name if it exists */}
                            {c.display_name && c.display_name.trim() !== "" && (
                                <Text style={{ marginTop: 8, fontSize: 14, color: "#6B7280" }}>
                                    Visar som: {c.display_name}
                                </Text>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            <TouchableOpacity
                disabled={saving}
                onPress={saveContacts}
                style={{
                    marginTop: 16,
                    backgroundColor: saving ? "#9CA3AF" : "#5FA893",
                    padding: 16,
                    borderRadius: 14,
                    alignItems: "center",
                }}
            >
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                    {saving ? "Sparar..." : "Spara kontakter"}
                </Text>
            </TouchableOpacity>

        </SafeAreaView>
    );
}