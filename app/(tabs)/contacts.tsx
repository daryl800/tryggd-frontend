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
    id?: string;
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
            return 60;
        } else if (SCREEN_HEIGHT < 800) {
            return 80;
        } else {
            return 90;
        }
    }
    return 0;
};

// Memoized Contact Card Component
const ContactCard = memo(({
    contact,
    index,
    isActive,
    onEmailChange,
    onFocus,
    onBlur,
    onRemove,
    inputRef,
    isNewContact,
}: {
    contact: ContactSlot;
    index: number;
    isActive: boolean;
    onEmailChange: (text: string) => void;
    onFocus: () => void;
    onBlur: () => void;
    onRemove: () => void;
    inputRef: (ref: TextInput | null) => void;
    isNewContact: boolean;
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
                    <Text style={styles.cardTitleText}>
                        {isNewContact ? `Ny kontakt` : `Kontakt ${index + 1}`}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={onRemove}
                    style={styles.removeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons
                        name={isNewContact ? "close-circle" : "trash-outline"}
                        size={24}
                        color={isNewContact ? "#9CA3AF" : "#EF4444"}
                    />
                </TouchableOpacity>
            </View>

            {isNewContact ? (
                <>
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
                </>
            ) : (
                <View style={styles.existingContactInfo}>
                    <View style={styles.existingContactRow}>
                        <Ionicons name="mail-outline" size={18} color="#6B7280" />
                        <Text style={styles.existingContactText}>{contact.email}</Text>
                    </View>
                    {contact.display_name && contact.display_name.trim() !== "" && (
                        <View style={styles.existingContactRow}>
                            <Ionicons name="person-outline" size={18} color="#6B7280" />
                            <Text style={styles.existingContactText}>{contact.display_name}</Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
});

export default function ContactsScreen() {
    const [existingContacts, setExistingContacts] = useState<ContactSlot[]>([]);
    const [newContacts, setNewContacts] = useState<ContactSlot[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);
    const inputRefs = useRef<(TextInput | null)[]>([]);

    // Calculate total contacts count
    const totalContactsCount = existingContacts.length + newContacts.length;

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
                .select("id, contact_user_id, contact_email, contact_display_name")
                .eq("owner_user_id", user.id)
                .order("created_at");

            if (error) throw error;

            const contacts: ContactSlot[] = contactRows?.map(row => ({
                id: row.id,
                user_id: row.contact_user_id,
                email: row.contact_email || "",
                display_name: row.contact_display_name || "",
            })) || [];

            setExistingContacts(contacts);
            setNewContacts([]);
        } catch (e: any) {
            console.error("Fetch contacts error:", e);
            Alert.alert("Error", "Failed to load contacts");
        } finally {
            setLoading(false);
        }
    };

    const handleAddNewContact = () => {
        // Check if we already have 3 contacts (existing + new)
        if (totalContactsCount >= 3) {
            Alert.alert(
                "Gräns nådd",
                "Du kan bara lägga till upp till 3 kontakter.",
                [{ text: "OK" }]
            );
            return;
        }

        // Calculate the new contact's index
        const newContactIndex = totalContactsCount;

        // Add a new empty contact slot
        setNewContacts(prev => [...prev, { email: "" }]);

        // Focus on the new input after a short delay
        setTimeout(() => {
            const inputRef = inputRefs.current[newContactIndex];
            if (inputRef) {
                inputRef.focus();
            }
        }, 150);
    };

    const updateNewContact = useCallback((index: number, email: string) => {
        setNewContacts(prev => prev.map((contact, i) =>
            i === index
                ? { ...contact, email, display_name: undefined, user_id: undefined }
                : contact
        ));
    }, []);

    const handleInputFocus = useCallback((index: number) => {
        setActiveInputIndex(index);

        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
            // Validate index
            if (index < 0 || index >= totalContactsCount) {
                return;
            }

            // Calculate scroll position
            let scrollY = index * 140;

            // Extra scroll for last item
            if (index === totalContactsCount - 1) {
                scrollY += 40;
            }

            // Scroll to position
            if (Platform.OS === 'ios') {
                setTimeout(() => {
                    scrollViewRef.current?.scrollTo({
                        y: scrollY,
                        animated: true,
                    });
                }, 250);
            } else {
                scrollViewRef.current?.scrollTo({
                    y: scrollY,
                    animated: true,
                });
            }
        });
    }, [totalContactsCount]);

    const handleInputBlur = useCallback((index: number) => {
        setActiveInputIndex(null);

        // Check if this is a new contact with empty email
        if (index >= existingContacts.length) {
            const newContactIndex = index - existingContacts.length;

            // Remove empty new contact immediately on blur
            setNewContacts(prev => {
                const contact = prev[newContactIndex];
                if (contact && (!contact.email || contact.email.trim() === "")) {
                    return prev.filter((_, i) => i !== newContactIndex);
                }
                return prev;
            });
        }
    }, [existingContacts.length]);

    const removeNewContact = useCallback((index: number) => {
        setNewContacts(prev => prev.filter((_, i) => i !== index));
    }, []);

    const removeExistingContact = useCallback(async (index: number) => {
        const contact = existingContacts[index];

        Alert.alert(
            "Ta bort kontakt",
            `Är du säker på att du vill ta bort ${contact.display_name || contact.email}?`,
            [
                { text: "Avbryt", style: "cancel" },
                {
                    text: "Ta bort",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("contacts")
                                .delete()
                                .eq("id", contact.id);

                            if (error) throw error;

                            // Remove from local state
                            setExistingContacts(prev => prev.filter((_, i) => i !== index));
                        } catch (error: any) {
                            Alert.alert("Error", "Failed to delete contact");
                        }
                    }
                }
            ]
        );
    }, [existingContacts]);

    const saveNewContacts = async () => {
        // Dismiss keyboard immediately
        inputRefs.current.forEach(ref => ref?.blur());

        // Filter out any empty new contacts
        const validNewContacts = newContacts.filter(
            contact => contact.email && contact.email.trim() !== ""
        );

        // Check if there are no valid new contacts to save
        if (validNewContacts.length === 0) {
            Alert.alert("Inga ändringar", "Inga nya kontakter att spara.");
            return;
        }

        setSaving(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error("Not authenticated");

            const resolved: ContactSlot[] = [];

            // Validate and resolve each new contact
            for (const c of validNewContacts) {
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

                // Check if contact already exists
                const alreadyExists = existingContacts.some(
                    existing => existing.user_id === userResult.user_id
                );

                if (alreadyExists) {
                    Alert.alert("Contact exists", `${emailToSearch} is already in your contacts`);
                    return;
                }

                resolved.push({
                    user_id: userResult.user_id,
                    email: userResult.email,
                    display_name: userResult.display_name
                });
            }

            if (resolved.length > 0) {
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

            Alert.alert("Sparad", "Nya kontakter har lagts till");

            // Refresh contacts
            await fetchContacts();
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to save contacts");
        } finally {
            setSaving(false);
        }
    };

    // Combine existing and new contacts for rendering
    const allContacts = [...existingContacts, ...newContacts];

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
                        <View style={styles.headerLeft}>
                            <Ionicons name="people" size={24} color="#5FA893" />
                            <Text style={styles.title}>Kontakter</Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleAddNewContact}
                            style={styles.addButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="add-circle" size={36} color="#5FA893" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.subtitle}>
                        {totalContactsCount > 0
                            ? `Du har ${totalContactsCount} av 3 möjliga kontakter`
                            : "Lägg till kontakter för att dela med dig (max 3)"
                        }
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
                    ) : allContacts.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
                            <Text style={styles.emptyStateTitle}>Inga kontakter</Text>
                            <Text style={styles.emptyStateText}>
                                Tryck på + knappen för att lägga till din första kontakt
                            </Text>
                        </View>
                    ) : (
                        allContacts.map((contact, index) => {
                            const isNewContact = index >= existingContacts.length;
                            const adjustedIndex = isNewContact
                                ? index - existingContacts.length
                                : index;

                            return (
                                <ContactCard
                                    key={isNewContact ? `new-${adjustedIndex}` : `existing-${contact.id}`}
                                    contact={contact}
                                    index={index}
                                    isActive={activeInputIndex === index}
                                    onEmailChange={(text) => updateNewContact(adjustedIndex, text)}
                                    onFocus={() => handleInputFocus(index)}
                                    onBlur={() => handleInputBlur(index)}
                                    onRemove={() => isNewContact
                                        ? removeNewContact(adjustedIndex)
                                        : removeExistingContact(adjustedIndex)
                                    }
                                    inputRef={(ref) => inputRefs.current[index] = ref}
                                    isNewContact={isNewContact}
                                />
                            );
                        })
                    )}
                </ScrollView>

                {/* Save Button (only shown when there are new contacts) */}
                {newContacts.length > 0 && (
                    <View style={styles.footer}>
                        <TouchableOpacity
                            disabled={saving}
                            onPress={saveNewContacts}
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
                                    {saving ? "Sparar..." : `Spara ${newContacts.length} ny${newContacts.length > 1 ? 'a' : ''} kontakt${newContacts.length > 1 ? 'er' : ''}`}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                )}
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
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        marginLeft: 10,
        color: "#1F2937",
    },
    addButton: {
        padding: 4,
    },
    subtitle: {
        fontSize: 14,
        color: "#6B7280",
        lineHeight: 20,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    loadingContainer: {
        alignItems: "center",
        padding: 32,
    },
    loadingIcon: {
        marginBottom: 10,
    },
    loadingText: {
        fontSize: 14,
        color: "#6B7280",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        paddingHorizontal: 20,
    },
    emptyStateTitle: {
        fontSize: 20,
        fontWeight: "600",
        color: "#374151",
        marginTop: 16,
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: "#6B7280",
        textAlign: "center",
        lineHeight: 20,
    },
    card: {
        backgroundColor: "#F9FAFB",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: "#F9FAFB",
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
        marginBottom: 10,
    },
    cardTitle: {
        flexDirection: "row",
        alignItems: "center",
    },
    cardNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "#5FA893",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8,
    },
    cardNumberText: {
        color: "#fff",
        fontWeight: "600",
        fontSize: 12,
    },
    cardTitleText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1F2937",
    },
    removeButton: {
        padding: 4,
    },
    input: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        fontSize: 15,
        color: "#1F2937",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        minHeight: 44,
    },
    displayNameContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        padding: 10,
        backgroundColor: "#EDF7F4",
        borderRadius: 10,
    },
    displayNameText: {
        marginLeft: 6,
        fontSize: 13,
        color: "#047857",
        fontWeight: "500",
    },
    existingContactInfo: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    existingContactRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    existingContactText: {
        marginLeft: 10,
        fontSize: 15,
        color: "#1F2937",
        flex: 1,
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 20 : 16,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
    },
    saveButton: {
        backgroundColor: "#5FA893",
        padding: 16,
        borderRadius: 14,
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
        marginRight: 6,
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
});