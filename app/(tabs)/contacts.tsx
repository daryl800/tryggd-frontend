// import { useEffect, useState } from "react";
// import {
//     Alert,
//     ScrollView,
//     Text,
//     TextInput,
//     TouchableOpacity,
//     View,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { supabase } from "../../lib/supabase";

// type ContactSlot = {
//     email: string;       // email input/search value
//     user_id?: string;    // resolved user ID
//     display_name?: string; // resolved display name
// };

// // Add this interface for the RPC response
// interface UserSearchResult {
//     user_id: string;
//     email: string;
//     display_name: string;
// }

// export default function ContactsScreen() {
//     const [contacts, setContacts] = useState<ContactSlot[]>([
//         { email: "" },
//         { email: "" },
//         { email: "" },
//     ]);
//     const [loading, setLoading] = useState(false);
//     const [saving, setSaving] = useState(false);

//     useEffect(() => {
//         fetchContacts();
//     }, []);

//     const fetchContacts = async () => {
//         setLoading(true);
//         try {
//             const { data: userData, error: userError } = await supabase.auth.getUser();
//             if (userError) throw userError;
//             const user = userData.user;
//             if (!user) return;

//             // Fetch contacts with stored email and display name
//             const { data: contactRows, error } = await supabase
//                 .from("contacts")
//                 .select("contact_user_id, contact_email, contact_display_name")
//                 .eq("owner_user_id", user.id)
//                 .order("created_at")
//                 .limit(3);

//             if (error) throw error;

//             // Initialize with 3 empty slots
//             const mapped: ContactSlot[] = [
//                 { email: "" },
//                 { email: "" },
//                 { email: "" }
//             ];

//             // Fill with actual contacts
//             if (contactRows?.length) {
//                 for (let i = 0; i < contactRows.length; i++) {
//                     mapped[i] = {
//                         user_id: contactRows[i].contact_user_id,
//                         email: contactRows[i].contact_email || "",
//                         display_name: contactRows[i].contact_display_name || "",
//                     };
//                 }
//             }

//             setContacts(mapped);
//         } catch (e: any) {
//             console.error("Fetch contacts error:", e);
//             Alert.alert("Error", "Failed to load contacts");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const updateContactSlot = (index: number, email: string) => {
//         const updated = [...contacts];
//         updated[index] = { ...updated[index], email, display_name: undefined, user_id: undefined };
//         setContacts(updated);
//     };

//     const saveContacts = async () => {
//         setSaving(true);
//         try {
//             const { data: userData } = await supabase.auth.getUser();
//             const user = userData.user;
//             if (!user) throw new Error("Not authenticated");

//             // Resolve emails → user_ids
//             const resolved: ContactSlot[] = [];

//             for (const c of contacts) {
//                 const emailToSearch = c.email.trim();
//                 console.log("[ContactsScreen] Searching for email:", emailToSearch);

//                 if (!emailToSearch) continue;

//                 // Use the RPC function to search for user by email with proper typing
//                 const { data: userResult, error } = await supabase
//                     .rpc('find_contact_by_email', {
//                         search_email: emailToSearch
//                     })
//                     .single() as { data: UserSearchResult | null; error: any };

//                 console.log("[ContactsScreen] User search result:", { userResult, error });

//                 if (error) {
//                     console.error("[ContactsScreen] Database error:", error);
//                     Alert.alert("Database error", "Could not search for user");
//                     return;
//                 }

//                 if (!userResult) {
//                     Alert.alert("Invalid email", `${emailToSearch} is not registered or not verified`);
//                     return;
//                 }

//                 // Prevent adding yourself as a contact
//                 if (userResult.user_id === user.id) {
//                     Alert.alert("Invalid contact", "You cannot add yourself as a contact");
//                     return;
//                 }

//                 resolved.push({
//                     user_id: userResult.user_id,
//                     email: userResult.email,
//                     display_name: userResult.display_name
//                 });
//             }

//             // Delete old contacts
//             const { error: deleteError } = await supabase
//                 .from("contacts")
//                 .delete()
//                 .eq("owner_user_id", user.id);

//             if (deleteError) {
//                 console.error("[ContactsScreen] Delete error:", deleteError);
//                 throw deleteError;
//             }

//             // Insert new contacts WITH email and display name
//             if (resolved.length) {
//                 const { error: insertError } = await supabase
//                     .from("contacts")
//                     .insert(
//                         resolved.map((c) => ({
//                             owner_user_id: user.id,
//                             contact_user_id: c.user_id,
//                             contact_email: c.email,           // Store email
//                             contact_display_name: c.display_name || "", // Store display name
//                             created_at: new Date().toISOString(),
//                         }))
//                     );

//                 if (insertError) {
//                     console.error("[ContactsScreen] Insert error:", insertError);
//                     throw insertError;
//                 }
//             }

//             Alert.alert("Saved", "Contacts updated successfully");

//             // Update the state with what we saved
//             const updatedContacts = [...resolved];
//             // Fill remaining slots with empty objects
//             while (updatedContacts.length < 3) {
//                 updatedContacts.push({ email: "" });
//             }
//             setContacts(updatedContacts);
//         } catch (e: any) {
//             console.error("Save contacts error:", e);
//             Alert.alert("Error", e.message || "Failed to save contacts");
//         } finally {
//             setSaving(false);
//         }
//     };

//     return (
//         <SafeAreaView
//             style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}
//         >
//             <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 24 }}>
//                 Kontakter
//             </Text>

//             <ScrollView style={{ flex: 1 }}>
//                 {loading ? (
//                     <Text style={{ textAlign: "center", padding: 20 }}>Laddar kontakter...</Text>
//                 ) : (
//                     contacts.map((c, idx) => (
//                         <View
//                             key={idx}
//                             style={{
//                                 backgroundColor: "#F9FAFB",
//                                 borderRadius: 16,
//                                 padding: 16,
//                                 marginBottom: 16,
//                             }}
//                         >
//                             <Text style={{ fontSize: 16, marginBottom: 8 }}>
//                                 Kontakt e-post {idx + 1}
//                             </Text>
//                             <TextInput
//                                 placeholder="example@mail.com"
//                                 value={c.email}
//                                 onChangeText={(text) => updateContactSlot(idx, text)}
//                                 autoCapitalize="none"
//                                 keyboardType="email-address"
//                                 style={{
//                                     backgroundColor: "#fff",
//                                     borderRadius: 12,
//                                     padding: 12,
//                                     fontSize: 16,
//                                 }}
//                             />
//                             {/* Show display name if it exists */}
//                             {c.display_name && c.display_name.trim() !== "" && (
//                                 <Text style={{ marginTop: 8, fontSize: 14, color: "#6B7280" }}>
//                                     Visar som: {c.display_name}
//                                 </Text>
//                             )}
//                         </View>
//                     ))
//                 )}
//             </ScrollView>

//             <TouchableOpacity
//                 disabled={saving}
//                 onPress={saveContacts}
//                 style={{
//                     marginTop: 16,
//                     backgroundColor: saving ? "#9CA3AF" : "#5FA893",
//                     padding: 16,
//                     borderRadius: 14,
//                     alignItems: "center",
//                 }}
//             >
//                 <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
//                     {saving ? "Sparar..." : "Spara kontakter"}
//                 </Text>
//             </TouchableOpacity>

//         </SafeAreaView>
//     );
// }



// import { useEffect, useState } from "react";
// import {
//     Alert,
//     KeyboardAvoidingView,
//     Platform,
//     ScrollView,
//     Text,
//     TextInput,
//     TouchableOpacity,
//     View,
// } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";
// import { supabase } from "../../lib/supabase";

// type ContactSlot = {
//     email: string;
//     user_id?: string;
//     display_name?: string;
// };

// interface UserSearchResult {
//     user_id: string;
//     email: string;
//     display_name: string;
// }

// export default function ContactsScreen() {
//     const [contacts, setContacts] = useState<ContactSlot[]>([
//         { email: "" },
//         { email: "" },
//         { email: "" },
//     ]);
//     const [loading, setLoading] = useState(false);
//     const [saving, setSaving] = useState(false);

//     useEffect(() => {
//         fetchContacts();
//     }, []);

//     const fetchContacts = async () => {
//         setLoading(true);
//         try {
//             const { data: userData, error: userError } = await supabase.auth.getUser();
//             if (userError) throw userError;
//             const user = userData.user;
//             if (!user) return;

//             const { data: contactRows, error } = await supabase
//                 .from("contacts")
//                 .select("contact_user_id, contact_email, contact_display_name")
//                 .eq("owner_user_id", user.id)
//                 .order("created_at")
//                 .limit(3);

//             if (error) throw error;

//             const mapped: ContactSlot[] = [
//                 { email: "" },
//                 { email: "" },
//                 { email: "" }
//             ];

//             if (contactRows?.length) {
//                 for (let i = 0; i < contactRows.length; i++) {
//                     mapped[i] = {
//                         user_id: contactRows[i].contact_user_id,
//                         email: contactRows[i].contact_email || "",
//                         display_name: contactRows[i].contact_display_name || "",
//                     };
//                 }
//             }

//             setContacts(mapped);
//         } catch (e: any) {
//             console.error("Fetch contacts error:", e);
//             Alert.alert("Error", "Failed to load contacts");
//         } finally {
//             setLoading(false);
//         }
//     };

//     const updateContactSlot = (index: number, email: string) => {
//         const updated = [...contacts];
//         updated[index] = { ...updated[index], email, display_name: undefined, user_id: undefined };
//         setContacts(updated);
//     };

//     const saveContacts = async () => {
//         setSaving(true);
//         try {
//             const { data: userData } = await supabase.auth.getUser();
//             const user = userData.user;
//             if (!user) throw new Error("Not authenticated");

//             const resolved: ContactSlot[] = [];

//             for (const c of contacts) {
//                 const emailToSearch = c.email.trim();
//                 if (!emailToSearch) continue;

//                 const { data: userResult, error } = await supabase
//                     .rpc('find_contact_by_email', {
//                         search_email: emailToSearch
//                     })
//                     .single() as { data: UserSearchResult | null; error: any };

//                 if (error) {
//                     Alert.alert("Database error", "Could not search for user");
//                     return;
//                 }

//                 if (!userResult) {
//                     Alert.alert("Invalid email", `${emailToSearch} is not registered or not verified`);
//                     return;
//                 }

//                 if (userResult.user_id === user.id) {
//                     Alert.alert("Invalid contact", "You cannot add yourself as a contact");
//                     return;
//                 }

//                 resolved.push({
//                     user_id: userResult.user_id,
//                     email: userResult.email,
//                     display_name: userResult.display_name
//                 });
//             }

//             const { error: deleteError } = await supabase
//                 .from("contacts")
//                 .delete()
//                 .eq("owner_user_id", user.id);

//             if (deleteError) throw deleteError;

//             if (resolved.length) {
//                 const { error: insertError } = await supabase
//                     .from("contacts")
//                     .insert(
//                         resolved.map((c) => ({
//                             owner_user_id: user.id,
//                             contact_user_id: c.user_id,
//                             contact_email: c.email,
//                             contact_display_name: c.display_name || "",
//                             created_at: new Date().toISOString(),
//                         }))
//                     );

//                 if (insertError) throw insertError;
//             }

//             Alert.alert("Saved", "Contacts updated successfully");

//             const updatedContacts = [...resolved];
//             while (updatedContacts.length < 3) {
//                 updatedContacts.push({ email: "" });
//             }
//             setContacts(updatedContacts);
//         } catch (e: any) {
//             Alert.alert("Error", e.message || "Failed to save contacts");
//         } finally {
//             setSaving(false);
//         }
//     };

//     return (
//         <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
//             <KeyboardAvoidingView
//                 style={{ flex: 1, padding: 24 }}
//                 behavior={Platform.OS === "ios" ? "padding" : "height"}
//             >
//                 <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 24 }}>
//                     Kontakter
//                 </Text>

//                 <ScrollView
//                     style={{ flex: 1 }}
//                     keyboardShouldPersistTaps="handled"
//                     contentContainerStyle={{ paddingBottom: 100 }}
//                 >
//                     {loading ? (
//                         <Text style={{ textAlign: "center", padding: 20 }}>Laddar kontakter...</Text>
//                     ) : (
//                         contacts.map((c, idx) => (
//                             <View
//                                 key={idx}
//                                 style={{
//                                     backgroundColor: "#F9FAFB",
//                                     borderRadius: 16,
//                                     padding: 16,
//                                     marginBottom: 16,
//                                     shadowColor: "#000",
//                                     shadowOffset: { width: 0, height: 2 },
//                                     shadowOpacity: 0.1,
//                                     shadowRadius: 4,
//                                     elevation: 3,
//                                 }}
//                             >
//                                 <Text style={{ fontSize: 16, marginBottom: 8 }}>
//                                     Kontakt e-post {idx + 1}
//                                 </Text>
//                                 <TextInput
//                                     placeholder="example@mail.com"
//                                     value={c.email}
//                                     onChangeText={(text) => updateContactSlot(idx, text)}
//                                     autoCapitalize="none"
//                                     keyboardType="email-address"
//                                     style={{
//                                         backgroundColor: "#fff",
//                                         borderRadius: 12,
//                                         padding: 12,
//                                         fontSize: 16,
//                                     }}
//                                 />
//                                 {c.display_name && c.display_name.trim() !== "" && (
//                                     <Text style={{ marginTop: 8, fontSize: 14, color: "#6B7280" }}>
//                                         Visar som: {c.display_name}
//                                     </Text>
//                                 )}
//                             </View>
//                         ))
//                     )}
//                 </ScrollView>

//                 <TouchableOpacity
//                     disabled={saving}
//                     onPress={saveContacts}
//                     style={{
//                         position: "absolute",
//                         bottom: 24,
//                         left: 24,
//                         right: 24,
//                         backgroundColor: saving ? "#9CA3AF" : "#5FA893",
//                         padding: 16,
//                         borderRadius: 14,
//                         alignItems: "center",
//                     }}
//                 >
//                     <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
//                         {saving ? "Sparar..." : "Spara kontakter"}
//                     </Text>
//                 </TouchableOpacity>
//             </KeyboardAvoidingView>
//         </SafeAreaView>
//     );
// }

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
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
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const inputRefs = useRef<Array<TextInput | null>>([]);
    const scrollViewRef = useRef<ScrollView>(null);
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        fetchContacts();
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start();
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

    const handleInputFocus = (index: number) => {
        setActiveInputIndex(index);
        // Scroll to input when focused (helps with keyboard covering)
        setTimeout(() => {
            inputRefs.current[index]?.measure((x, y, width, height, pageX, pageY) => {
                scrollViewRef.current?.scrollTo({
                    y: pageY - 100,
                    animated: true,
                });
            });
        }, 100);
    };

    const handleInputBlur = () => {
        setActiveInputIndex(null);
    };

    const saveContacts = async () => {
        Keyboard.dismiss();
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

    const clearContact = (index: number) => {
        const updated = [...contacts];
        updated[index] = { email: "" };
        setContacts(updated);
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: "#fff" }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <Animated.View style={{
                    flex: 1,
                    opacity: fadeAnim,
                    paddingHorizontal: 24,
                    paddingTop: 16,
                }}>
                    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                        {/* Header */}
                        <View style={{ marginBottom: 32 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                                <Ionicons name="people" size={28} color="#5FA893" />
                                <Text style={{
                                    fontSize: 32,
                                    fontWeight: "800",
                                    marginLeft: 12,
                                    color: "#1F2937",
                                }}>
                                    Kontakter
                                </Text>
                            </View>
                            <Text style={{
                                fontSize: 16,
                                color: "#6B7280",
                                lineHeight: 22,
                            }}>
                                Lägg till upp till 3 kontakter för att dela med dig
                            </Text>
                        </View>

                        {/* Contact Cards */}
                        <ScrollView
                            ref={scrollViewRef}
                            showsVerticalScrollIndicator={false}
                            style={{ flex: 1 }}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ paddingBottom: 20 }}
                        >
                            {loading ? (
                                <View style={{ alignItems: "center", padding: 40 }}>
                                    <Ionicons name="refresh" size={40} color="#9CA3AF" style={{ marginBottom: 12 }} />
                                    <Text style={{ fontSize: 16, color: "#6B7280" }}>Laddar kontakter...</Text>
                                </View>
                            ) : (
                                contacts.map((c, idx) => (
                                    <View
                                        key={idx}
                                        style={{
                                            backgroundColor: activeInputIndex === idx ? "#F3F4F6" : "#F9FAFB",
                                            borderRadius: 20,
                                            padding: 20,
                                            marginBottom: 16,
                                            borderWidth: 2,
                                            borderColor: activeInputIndex === idx ? "#5FA893" : "#F9FAFB",
                                            shadowColor: "#000",
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.05,
                                            shadowRadius: 8,
                                            elevation: 2,
                                        }}
                                    >
                                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                            <View style={{ flexDirection: "row", alignItems: "center" }}>
                                                <View style={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 16,
                                                    backgroundColor: "#5FA893",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    marginRight: 10,
                                                }}>
                                                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{idx + 1}</Text>
                                                </View>
                                                <Text style={{ fontSize: 18, fontWeight: "600", color: "#1F2937" }}>
                                                    Kontakt {idx + 1}
                                                </Text>
                                            </View>
                                            {c.email.trim() !== "" && (
                                                <TouchableOpacity
                                                    onPress={() => clearContact(idx)}
                                                    style={{ padding: 4 }}
                                                >
                                                    <Ionicons name="close-circle" size={24} color="#9CA3AF" />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <TextInput
                                            ref={ref => inputRefs.current[idx] = ref}
                                            placeholder="Ange e-postadress"
                                            placeholderTextColor="#9CA3AF"
                                            value={c.email}
                                            onChangeText={(text) => updateContactSlot(idx, text)}
                                            onFocus={() => handleInputFocus(idx)}
                                            onBlur={handleInputBlur}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                            autoCorrect={false}
                                            spellCheck={false}
                                            style={{
                                                backgroundColor: "#fff",
                                                borderRadius: 14,
                                                padding: 16,
                                                fontSize: 16,
                                                color: "#1F2937",
                                                borderWidth: 1,
                                                borderColor: "#E5E7EB",
                                            }}
                                        />

                                        {/* Show display name if it exists */}
                                        {c.display_name && c.display_name.trim() !== "" && (
                                            <View style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                marginTop: 12,
                                                padding: 12,
                                                backgroundColor: "#EDF7F4",
                                                borderRadius: 12,
                                            }}>
                                                <Ionicons name="checkmark-circle" size={20} color="#5FA893" />
                                                <Text style={{
                                                    marginLeft: 8,
                                                    fontSize: 14,
                                                    color: "#047857",
                                                    fontWeight: "500",
                                                }}>
                                                    Visar som: {c.display_name}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                ))
                            )}
                        </ScrollView>

                        {/* Save Button */}
                        <View style={{
                            paddingTop: 16,
                            paddingBottom: Platform.OS === 'ios' ? 34 : 24,
                            backgroundColor: "#fff",
                            borderTopWidth: 1,
                            borderTopColor: "#F3F4F6",
                        }}>
                            <TouchableOpacity
                                disabled={saving}
                                onPress={saveContacts}
                                activeOpacity={0.8}
                                style={{
                                    backgroundColor: saving ? "#9CA3AF" : "#5FA893",
                                    padding: 18,
                                    borderRadius: 16,
                                    alignItems: "center",
                                    shadowColor: "#5FA893",
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.2,
                                    shadowRadius: 8,
                                    elevation: 4,
                                }}
                            >
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    {saving ? (
                                        <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
                                    ) : (
                                        <Ionicons name="save" size={20} color="#fff" style={{ marginRight: 8 }} />
                                    )}
                                    <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}>
                                        {saving ? "Sparar..." : "Spara kontakter"}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </SafeAreaView>
                </Animated.View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}
