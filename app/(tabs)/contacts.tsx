import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type ContactSlot = {
    email: string;
    user_id?: string;
    display_name?: string;
};

interface UserSearchResult {
    user_id: string;
    email: string;
    display_name: string;
}

// Get screen dimensions
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Calculate optimal keyboard vertical offset based on screen height
const getKeyboardVerticalOffset = () => {
    if (Platform.OS === 'ios') {
        if (SCREEN_HEIGHT < 700) {
            return 60; // For smaller screens (iPhone SE, 8, etc.)
        } else if (SCREEN_HEIGHT < 800) {
            return 80; // For medium screens (iPhone 11, 12, etc.)
        } else {
            return 90; // For larger screens (iPhone Pro Max, etc.)
        }
    }
    return 0; // Android handles it differently
};

// Memoized Contact Card Component
const ContactCard = memo(({
    contact,
    index,
    isActive,
    onEmailChange,
    onFocus,
    onBlur,
    onClear,
    inputRef,
}: {
    contact: ContactSlot;
    index: number;
    isActive: boolean;
    onEmailChange: (text: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    onClear: () => void;
    inputRef: (ref: TextInput | null) => void;
}) => {
    return (
        <View style={[
            styles.card,
            isActive && styles.cardActive
        ]}>
            <View style={styles.cardHeader}>
                <View style={styles.cardTitle}>
                    <View style={styles.cardNumber}>
                        <Text style={styles.cardNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.cardTitleText}>Kontakt {index + 1}</Text>
                </View>
                {contact.email.trim() !== "" && (
                    <TouchableOpacity
                        onPress={onClear}
                        style={styles.clearButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close-circle" size={24} color="#9CA3AF" />
                    </TouchableOpacity>
                )}
            </View>

            <TextInput
                ref={inputRef}
                placeholder="Ange e-postadress"
                placeholderTextColor="#9CA3AF"
                value={contact.email}
                onChangeText={onEmailChange}
                onFocus={onFocus}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                spellCheck={false}
                style={styles.input}
            />

            {contact.display_name && contact.display_name.trim() !== "" && (
                <View style={styles.displayNameContainer}>
                    <Ionicons name="checkmark-circle" size={18} color="#5FA893" />
                    <Text style={styles.displayNameText}>
                        Visar som: {contact.display_name}
                    </Text>
                </View>
            )}
        </View>
    );
});

export default function ContactsScreen() {
    const [contacts, setContacts] = useState<ContactSlot[]>([
        { email: "" },
        { email: "" },
        { email: "" },
    ]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const inputRefs = useRef<(TextInput | null)[]>([]);

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

            const { data: contactRows, error } = await supabase
                .from("contacts")
                .select("contact_user_id, contact_email, contact_display_name")
                .eq("owner_user_id", user.id)
                .order("created_at")
                .limit(3);

            if (error) throw error;

            const mapped: ContactSlot[] = [
                { email: "" },
                { email: "" },
                { email: "" }
            ];

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

    const updateContactSlot = useCallback((index: number, email: string) => {
        setContacts(prev => prev.map((contact, i) =>
            i === index
                ? { ...contact, email, display_name: undefined, user_id: undefined }
                : contact
        ));
    }, []);

    const handleInputFocus = useCallback((index: number) => {
        setActiveInputIndex(index);

        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
            // Calculate scroll position based on which input is focused
            // For the 3rd input, scroll more to ensure it's visible above keyboard
            let scrollY = index * 140; // Reduced from 180

            // If it's the 3rd input (index 2), scroll extra to ensure visibility
            if (index === 2) {
                scrollY += 40; // Extra scroll for the last item
            }

            if (Platform.OS === 'ios') {
                // iOS needs a small delay for proper scrolling
                setTimeout(() => {
                    scrollViewRef.current?.scrollTo({
                        y: scrollY,
                        animated: true,
                    });
                }, 250);
            } else {
                // Android scrolling
                scrollViewRef.current?.scrollTo({
                    y: scrollY,
                    animated: true,
                });
            }
        });
    }, []);

    const handleInputBlur = useCallback(() => {
        setActiveInputIndex(null);
    }, []);

    const clearContact = useCallback((index: number) => {
        setContacts(prev => prev.map((contact, i) =>
            i === index ? { email: "" } : contact
        ));
    }, []);

    const saveContacts = async () => {
        // Dismiss keyboard immediately
        inputRefs.current.forEach(ref => ref?.blur());
        setSaving(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error("Not authenticated");

            const resolved: ContactSlot[] = [];

            for (const c of contacts) {
                const emailToSearch = c.email.trim();
                if (!emailToSearch) continue;

                const { data: userResult, error } = await supabase
                    .rpc('find_contact_by_email', {
                        search_email: emailToSearch
                    })
                    .single() as { data: UserSearchResult | null; error: any };

                if (error) {
                    Alert.alert("Database error", "Could not search for user");
                    return;
                }

                if (!userResult) {
                    Alert.alert("Invalid email", `${emailToSearch} is not registered or not verified`);
                    return;
                }

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

            const { error: deleteError } = await supabase
                .from("contacts")
                .delete()
                .eq("owner_user_id", user.id);

            if (deleteError) throw deleteError;

            if (resolved.length) {
                const { error: insertError } = await supabase
                    .from("contacts")
                    .insert(
                        resolved.map((c) => ({
                            owner_user_id: user.id,
                            contact_user_id: c.user_id,
                            contact_email: c.email,
                            contact_display_name: c.display_name || "",
                            created_at: new Date().toISOString(),
                        }))
                    );

                if (insertError) throw insertError;
            }

            Alert.alert("Saved", "Contacts updated successfully");

            const updatedContacts = [...resolved];
            while (updatedContacts.length < 3) {
                updatedContacts.push({ email: "" });
            }
            setContacts(updatedContacts);
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to save contacts");
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={getKeyboardVerticalOffset()}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Ionicons name="people" size={24} color="#5FA893" />
                        <Text style={styles.title}>Kontakter</Text>
                    </View>
                    <Text style={styles.subtitle}>
                        Lägg till upp till 3 kontakter för att dela med dig
                    </Text>
                </View>

                {/* Contact Cards */}
                <ScrollView
                    ref={scrollViewRef}
                    showsVerticalScrollIndicator={false}
                    style={styles.scrollView}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.scrollContent}
                >
                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <Ionicons
                                name="refresh"
                                size={36}
                                color="#9CA3AF"
                                style={styles.loadingIcon}
                            />
                            <Text style={styles.loadingText}>Laddar kontakter...</Text>
                        </View>
                    ) : (
                        contacts.map((contact, index) => (
                            <ContactCard
                                key={`contact-${index}`}
                                contact={contact}
                                index={index}
                                isActive={activeInputIndex === index}
                                onEmailChange={(text) => updateContactSlot(index, text)}
                                onFocus={() => handleInputFocus(index)}
                                onBlur={handleInputBlur}
                                onClear={() => clearContact(index)}
                                inputRef={(ref) => inputRefs.current[index] = ref}
                            />
                        ))
                    )}
                </ScrollView>

                {/* Save Button */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        disabled={saving}
                        onPress={saveContacts}
                        activeOpacity={0.8}
                        style={[
                            styles.saveButton,
                            saving && styles.saveButtonDisabled
                        ]}
                    >
                        <View style={styles.buttonContent}>
                            {saving ? (
                                <Ionicons name="refresh" size={18} color="#fff" style={styles.buttonIcon} />
                            ) : (
                                <Ionicons name="save" size={18} color="#fff" style={styles.buttonIcon} />
                            )}
                            <Text style={styles.buttonText}>
                                {saving ? "Sparar..." : "Spara kontakter"}
                            </Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 12,
        marginBottom: 16, // Reduced from 24
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 6, // Reduced from 8
    },
    title: {
        fontSize: 28, // Reduced from 32
        fontWeight: "800",
        marginLeft: 10, // Reduced from 12
        color: "#1F2937",
    },
    subtitle: {
        fontSize: 14, // Reduced from 16
        color: "#6B7280",
        lineHeight: 20, // Reduced from 22
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 16, // Reduced from 20
    },
    loadingContainer: {
        alignItems: "center",
        padding: 32, // Reduced from 40
    },
    loadingIcon: {
        marginBottom: 10, // Reduced from 12
    },
    loadingText: {
        fontSize: 14, // Reduced from 16
        color: "#6B7280",
    },
    card: {
        backgroundColor: "#F9FAFB",
        borderRadius: 16, // Reduced from 20
        padding: 16, // Reduced from 20
        marginBottom: 12, // Reduced from 16
        borderWidth: 2,
        borderColor: "#F9FAFB",
        // Use elevation for Android, simpler shadow for iOS
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 1,
            },
        }),
    },
    cardActive: {
        backgroundColor: "#F3F4F6",
        borderColor: "#5FA893",
    },
    cardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10, // Reduced from 12
    },
    cardTitle: {
        flexDirection: "row",
        alignItems: "center",
    },
    cardNumber: {
        width: 28, // Reduced from 32
        height: 28, // Reduced from 32
        borderRadius: 14, // Reduced from 16
        backgroundColor: "#5FA893",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8, // Reduced from 10
    },
    cardNumberText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 12, // Reduced from 14
    },
    cardTitleText: {
        fontSize: 16, // Reduced from 18
        fontWeight: "600",
        color: "#1F2937",
    },
    clearButton: {
        padding: 4,
    },
    input: {
        backgroundColor: "#fff",
        borderRadius: 12, // Reduced from 14
        padding: 12, // Reduced from 16
        fontSize: 15, // Reduced from 16
        color: "#1F2937",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        minHeight: 44, // Standard touch target height
    },
    displayNameContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8, // Reduced from 12
        padding: 10, // Reduced from 12
        backgroundColor: "#EDF7F4",
        borderRadius: 10, // Reduced from 12
    },
    displayNameText: {
        marginLeft: 6, // Reduced from 8
        fontSize: 13, // Reduced from 14
        color: "#047857",
        fontWeight: "500",
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12, // Reduced from 16
        paddingBottom: Platform.OS === 'ios' ? 20 : 16, // Reduced padding
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
    },
    saveButton: {
        backgroundColor: "#5FA893",
        padding: 16, // Reduced from 18
        borderRadius: 14, // Reduced from 16
        alignItems: "center",
        ...Platform.select({
            ios: {
                shadowColor: '#5FA893',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    saveButtonDisabled: {
        backgroundColor: "#9CA3AF",
    },
    buttonContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    buttonIcon: {
        marginRight: 6, // Reduced from 8
    },
    buttonText: {
        color: "#fff",
        fontSize: 16, // Reduced from 17
        fontWeight: "600",
    },
});