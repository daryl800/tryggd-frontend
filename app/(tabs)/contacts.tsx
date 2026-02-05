import { sendContactRequestNotification } from "@/lib/notifications";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next"; // ADD THIS
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

type ContactRequest = {
    id: string;
    sender_user_id: string;
    receiver_user_id: string;
    sender_email: string;
    sender_display_name?: string;
    message?: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
};

interface UserSearchResult {
    user_id: string;
    email: string;
    display_name: string;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const getKeyboardVerticalOffset = () => {
    if (Platform.OS === 'ios') {
        if (SCREEN_HEIGHT < 700) return 60;
        if (SCREEN_HEIGHT < 800) return 80;
        return 90;
    }
    return 0;
};

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
    const { t } = useTranslation(); // ADD THIS

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
                        {isNewContact ? t("contacts.newContact") : `${t("contacts.contact")} ${index + 1}`}
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
                        placeholder={t("contacts.placeholders.email")}
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
                                {t("contacts.displayingAs")} {contact.display_name}
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

const ContactRequestCard = memo(({
    request,
    onAccept,
    onReject,
    onCancel,
    isOutgoing,
}: {
    request: ContactRequest;
    onAccept: () => void;
    onReject: () => void;
    onCancel: () => void;
    isOutgoing: boolean;
}) => {
    const { t } = useTranslation(); // ADD THIS

    const getTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return t("time.justNow");
        if (diffMins < 60) return t("time.minutesAgo", { count: diffMins });
        if (diffHours < 24) return t("time.hoursAgo", { count: diffHours });
        if (diffDays < 7) return t("time.daysAgo", { count: diffDays });
        return date.toLocaleDateString();
    };

    return (
        <View style={styles.requestCard}>
            <View style={styles.requestHeader}>
                <View style={styles.requestInfo}>
                    <Ionicons
                        name={isOutgoing ? "person-add-outline" : "person-outline"}
                        size={20}
                        color="#6B7280"
                    />
                    <View style={styles.requestTextContainer}>
                        <Text style={styles.requestName}>
                            {isOutgoing ? t("contacts.requests.waiting") : request.sender_display_name || request.sender_email}
                        </Text>
                        <Text style={styles.requestEmail}>
                            {isOutgoing ? request.receiver_user_id : request.sender_email}
                        </Text>
                    </View>
                </View>
                <Text style={styles.requestTime}>
                    {getTimeAgo(request.created_at)}
                </Text>
            </View>

            {request.message && (
                <View style={styles.requestMessage}>
                    <Text style={styles.requestMessageText}>"{request.message}"</Text>
                </View>
            )}

            {isOutgoing ? (
                <TouchableOpacity
                    onPress={onCancel}
                    style={styles.cancelButton}
                >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                    <Text style={styles.cancelButtonText}>{t("contacts.buttons.cancelRequest")}</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.requestActions}>
                    <TouchableOpacity
                        onPress={onAccept}
                        style={[styles.requestButton, styles.acceptButton]}
                    >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.acceptButtonText}>{t("contacts.buttons.accept")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onReject}
                        style={[styles.requestButton, styles.rejectButton]}
                    >
                        <Ionicons name="close" size={18} color="#9CA3AF" />
                        <Text style={styles.rejectButtonText}>{t("contacts.buttons.reject")}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

export default function ContactsScreen() {
    const { t } = useTranslation(); // ADD THIS
    const [existingContacts, setExistingContacts] = useState<ContactSlot[]>([]);
    const [newContacts, setNewContacts] = useState<ContactSlot[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const [activeSection, setActiveSection] = useState<'contacts' | 'requests'>('contacts');
    const [hasUnreadRequests, setHasUnreadRequests] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);
    const inputRefs = useRef<(TextInput | null)[]>([]);
    const fetchAllDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const totalContactsCount = existingContacts.length + newContacts.length;
    const totalRequestsCount = incomingRequests.length + outgoingRequests.length;

    useEffect(() => {
        const markAsRead = async () => {
            if (activeSection === 'requests') {
                await AsyncStorage.setItem('last_viewed_requests', new Date().toISOString());
                setHasUnreadRequests(false);
            }
        };

        markAsRead();
    }, [activeSection]);

    useEffect(() => {
        fetchAllData();
        checkUnreadRequests();
        cleanupContactData();

        let contactRequestsSubscription: any = null;
        let contactsSubscription: any = null;

        const setupSubscriptions = async () => {
            contactRequestsSubscription = await subscribeToContactRequests();
            contactsSubscription = await subscribeToContacts();
        };

        setupSubscriptions();

        return () => {
            if (fetchAllDataTimeoutRef.current) {
                clearTimeout(fetchAllDataTimeoutRef.current);
            }

            if (contactRequestsSubscription) {
                contactRequestsSubscription.then((sub: any) => sub?.unsubscribe());
            }
            if (contactsSubscription) {
                contactsSubscription.then((sub: any) => sub?.unsubscribe());
            }
        };
    }, []);

    const fetchAllData = async () => {
        if (fetchAllDataTimeoutRef.current) {
            clearTimeout(fetchAllDataTimeoutRef.current);
        }

        fetchAllDataTimeoutRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data: userData } = await supabase.auth.getUser();
                const user = userData.user;
                if (!user) return;

                // Fetch existing contacts
                const { data: contactRows } = await supabase
                    .from("contacts")
                    .select("id, contact_user_id, contact_email, contact_display_name")
                    .eq("owner_user_id", user.id)
                    .order("created_at");

                const contacts: ContactSlot[] = contactRows?.map(row => ({
                    id: row.id,
                    user_id: row.contact_user_id,
                    email: row.contact_email || "",
                    display_name: row.contact_display_name || "",
                })) || [];

                setExistingContacts(contacts);

                // Fetch incoming contact requests
                const { data: incomingData } = await supabase
                    .from("contact_requests")
                    .select("*")
                    .eq("receiver_user_id", user.id)
                    .eq("status", "pending")
                    .order("created_at", { ascending: false });

                setIncomingRequests(incomingData || []);

                // Fetch outgoing contact requests
                const { data: outgoingData } = await supabase
                    .from("contact_requests")
                    .select("*")
                    .eq("sender_user_id", user.id)
                    .eq("status", "pending")
                    .order("created_at", { ascending: false });

                setOutgoingRequests(outgoingData || []);
            } catch (error) {
                console.error("Fetch data error:", error);
                Alert.alert(t("errors.title"), t("contacts.errors.loadData"));
            } finally {
                setLoading(false);
            }
        }, 300);
    };

    const subscribeToContactRequests = async () => {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return null;

        const subscription = supabase
            .channel(`contact_requests:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contact_requests',
                    filter: `receiver_user_id=eq.${user.id}`,
                },
                (payload) => {
                    fetchAllData();
                    checkUnreadRequests();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contact_requests',
                    filter: `sender_user_id=eq.${user.id}`,
                },
                (payload) => {
                    fetchAllData();
                }
            )
            .subscribe((status) => {
                console.log("Contact requests subscription status:", status);
            });

        return subscription;
    };

    const subscribeToContacts = async () => {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return null;

        const subscription = supabase
            .channel(`contacts:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contacts',
                    filter: `contact_user_id=eq.${user.id}`,
                },
                (payload) => {
                    fetchAllData();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contacts',
                    filter: `owner_user_id=eq.${user.id}`,
                },
                (payload) => {
                    fetchAllData();
                }
            )
            .subscribe((status) => {
                console.log("Contacts subscription status:", status);
            });

        return subscription;
    };

    const checkUnreadRequests = async () => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            const { data: requests } = await supabase
                .from("contact_requests")
                .select("id, created_at")
                .eq("receiver_user_id", user.id)
                .eq("status", "pending")
                .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

            const lastViewed = await AsyncStorage.getItem('last_viewed_requests');
            const unreadCount = requests?.filter(request => {
                if (!lastViewed) return true;
                return new Date(request.created_at) > new Date(lastViewed);
            }).length || 0;

            setHasUnreadRequests(unreadCount > 0);
        } catch (error) {
            console.error("Check unread requests error:", error);
        }
    };

    const handleManualRefresh = async () => {
        setLoading(true);
        await fetchAllData();
        await checkUnreadRequests();
        setLoading(false);
    };

    const handleAddNewContact = () => {
        if (totalContactsCount >= 3) {
            Alert.alert(
                t("contacts.alerts.limitReached.title"),
                t("contacts.alerts.limitReached.message"),
                [{ text: t("common.ok") }]
            );
            return;
        }

        const newContactIndex = totalContactsCount;
        setNewContacts(prev => [...prev, { email: "" }]);

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

        requestAnimationFrame(() => {
            if (index < 0 || index >= totalContactsCount) {
                return;
            }

            let scrollY = index * 140;
            if (index === totalContactsCount - 1) {
                scrollY += 40;
            }

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

        if (index >= existingContacts.length) {
            const newContactIndex = index - existingContacts.length;
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
            t("contacts.alerts.delete.title"),
            t("contacts.alerts.delete.message", {
                name: contact.display_name || contact.email
            }),
            [
                { text: t("common.cancel"), style: "cancel" },
                {
                    text: t("contacts.buttons.delete"),
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const { data: userData } = await supabase.auth.getUser();
                            const user = userData.user;
                            if (!user || !contact.user_id) return;

                            const { data, error } = await supabase
                                .rpc('completely_remove_relationship', {
                                    p_user1_id: user.id,
                                    p_user2_id: contact.user_id
                                });

                            if (error) {
                                await deleteEverythingManually(user.id, contact.user_id);
                            } else if (data?.error) {
                                await deleteEverythingManually(user.id, contact.user_id);
                            } else {
                                console.log("Relationship completely removed:", data);
                            }

                            setExistingContacts(prev => prev.filter((_, i) => i !== index));
                            Alert.alert(
                                t("contacts.success.deleted.title"),
                                t("contacts.success.deleted.message", {
                                    name: contact.display_name || contact.email
                                })
                            );
                        } catch (error: any) {
                            console.error("Delete error:", error);
                            Alert.alert(t("errors.title"), t("contacts.errors.delete"));
                        }
                    }
                }
            ]
        );
    }, [existingContacts]);

    const deleteEverythingManually = async (userId1: string, userId2: string) => {
        try {
            const { error: contactsError } = await supabase
                .from("contacts")
                .delete()
                .or(`and(owner_user_id.eq.${userId1},contact_user_id.eq.${userId2}),and(owner_user_id.eq.${userId2},contact_user_id.eq.${userId1})`);

            if (contactsError) {
                await supabase
                    .from("contacts")
                    .delete()
                    .eq("owner_user_id", userId1)
                    .eq("contact_user_id", userId2);
            }

            const { error: requestsError } = await supabase
                .from("contact_requests")
                .delete()
                .or(`and(sender_user_id.eq.${userId1},receiver_user_id.eq.${userId2}),and(sender_user_id.eq.${userId2},receiver_user_id.eq.${userId1})`);

            if (requestsError) {
                console.error("Requests deletion error:", requestsError);
            }
        } catch (error) {
            console.error("Manual deletion failed:", error);
            throw error;
        }
    };

    const sendContactRequest = async (contact: ContactSlot) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user || !contact.user_id) return;

            const { data: existingContact } = await supabase
                .from("contacts")
                .select("*")
                .eq("owner_user_id", user.id)
                .eq("contact_user_id", contact.user_id)
                .maybeSingle();

            if (existingContact) {
                Alert.alert(
                    t("contacts.alerts.contactExists.title"),
                    t("contacts.alerts.contactExists.message", {
                        name: contact.display_name || contact.email
                    })
                );
                return;
            }

            const { data: existingRequest } = await supabase
                .from("contact_requests")
                .select("*")
                .or(`and(sender_user_id.eq.${user.id},receiver_user_id.eq.${contact.user_id}),and(sender_user_id.eq.${contact.user_id},receiver_user_id.eq.${user.id})`)
                .maybeSingle();

            if (existingRequest) {
                if (existingRequest.status === "pending" && existingRequest.sender_user_id === user.id) {
                    Alert.alert(
                        t("contacts.alerts.requestExists.title"),
                        t("contacts.alerts.requestExists.message")
                    );
                    return;
                }

                if (existingRequest.status === "pending" && existingRequest.receiver_user_id === user.id) {
                    Alert.alert(
                        t("contacts.alerts.requestReceived.title"),
                        t("contacts.alerts.requestReceived.message", {
                            email: contact.email
                        })
                    );
                    return;
                }

                if (existingRequest.status === "accepted" || existingRequest.status === "rejected") {
                    await supabase
                        .from("contact_requests")
                        .delete()
                        .eq("id", existingRequest.id);
                }
            }

            const { data, error } = await supabase
                .from("contact_requests")
                .insert({
                    sender_user_id: user.id,
                    receiver_user_id: contact.user_id,
                    sender_email: user.email || '',
                    sender_display_name: user.user_metadata?.display_name || user.email?.split('@')[0],
                    status: 'pending'
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    const { data: duplicateCheck } = await supabase
                        .from("contact_requests")
                        .select("*")
                        .eq("sender_user_id", user.id)
                        .eq("receiver_user_id", contact.user_id)
                        .maybeSingle();

                    if (duplicateCheck) {
                        Alert.alert(
                            t("contacts.alerts.requestExists.title"),
                            t("contacts.alerts.requestExists.message")
                        );
                        return;
                    }
                }

                throw error;
            }

            await sendContactRequestNotification({
                receiverUserId: contact.user_id,
                senderUserId: user.id,
                senderName: user.user_metadata?.display_name || user.email?.split('@')[0],
                senderEmail: user.email || '',
                requestId: data.id,
            });

            setOutgoingRequests(prev => [data, ...prev]);
            Alert.alert(
                t("contacts.success.requestSent.title"),
                t("contacts.success.requestSent.message", {
                    name: contact.display_name || contact.email
                })
            );
        } catch (error) {
            console.error("Send request error:", error);
            Alert.alert(t("errors.title"), t("contacts.errors.sendRequest"));
        }
    };

    const saveNewContacts = async () => {
        inputRefs.current.forEach(ref => ref?.blur());

        const validNewContacts = newContacts.filter(
            contact => contact.email && contact.email.trim() !== ""
        );

        if (validNewContacts.length === 0) {
            Alert.alert(
                t("contacts.alerts.noChanges.title"),
                t("contacts.alerts.noChanges.message")
            );
            return;
        }

        setSaving(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error(t("errors.notAuthenticated"));

            const resolved: ContactSlot[] = [];

            for (const c of validNewContacts) {
                const emailToSearch = c.email.trim();
                if (!emailToSearch) continue;

                const { data: userResult, error } = await supabase
                    .rpc('find_contact_by_email', {
                        search_email: emailToSearch
                    })
                    .single() as { data: UserSearchResult | null; error: any };

                if (error) {
                    Alert.alert(t("errors.title"), t("contacts.errors.search"));
                    return;
                }

                if (!userResult) {
                    Alert.alert(
                        t("contacts.alerts.invalidEmail.title"),
                        t("contacts.alerts.invalidEmail.message", { email: emailToSearch })
                    );
                    return;
                }

                if (userResult.user_id === user.id) {
                    Alert.alert(
                        t("contacts.alerts.selfContact.title"),
                        t("contacts.alerts.selfContact.message")
                    );
                    return;
                }

                const { data: existingContact } = await supabase
                    .from("contacts")
                    .select("*")
                    .eq("owner_user_id", user.id)
                    .eq("contact_user_id", userResult.user_id)
                    .maybeSingle();

                if (existingContact) {
                    Alert.alert(
                        t("contacts.alerts.contactExists.title"),
                        t("contacts.alerts.contactExists.message", { email: emailToSearch })
                    );
                    return;
                }

                const { data: existingRequest } = await supabase
                    .from("contact_requests")
                    .select("*")
                    .or(`and(sender_user_id.eq.${user.id},receiver_user_id.eq.${userResult.user_id}),and(sender_user_id.eq.${userResult.user_id},receiver_user_id.eq.${user.id})`)
                    .eq("status", "pending")
                    .maybeSingle();

                if (existingRequest) {
                    if (existingRequest.sender_user_id === user.id) {
                        Alert.alert(
                            t("contacts.alerts.requestExists.title"),
                            t("contacts.alerts.requestExists.message")
                        );
                    } else {
                        Alert.alert(
                            t("contacts.alerts.requestReceived.title"),
                            t("contacts.alerts.requestReceived.message", { email: emailToSearch })
                        );
                    }
                    return;
                }

                resolved.push({
                    user_id: userResult.user_id,
                    email: userResult.email,
                    display_name: userResult.display_name
                });
            }

            for (const contact of resolved) {
                await sendContactRequest(contact);
            }

            setNewContacts([]);
        } catch (e: any) {
            Alert.alert(t("errors.title"), e.message || t("contacts.errors.save"));
        } finally {
            setSaving(false);
        }
    };

    const handleAcceptRequest = async (requestId: string) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            const { data: requestData, error: fetchError } = await supabase
                .from("contact_requests")
                .select("*")
                .eq("id", requestId)
                .eq("receiver_user_id", user.id)
                .eq("status", "pending")
                .maybeSingle();

            if (fetchError || !requestData) {
                Alert.alert(t("errors.title"), t("contacts.errors.requestNotFound"));
                setIncomingRequests(prev => prev.filter(req => req.id !== requestId));
                return;
            }

            const { data, error } = await supabase
                .rpc('accept_contact_request', { request_id: requestId });

            if (error) {
                console.error("Database function error:", error);
                throw new Error(t("contacts.errors.accept"));
            }

            if (data?.error) {
                Alert.alert(t("errors.title"), data.error);
                return;
            }

            if (data?.warning) {
                setIncomingRequests(prev => prev.filter(req => req.id !== requestId));
                Alert.alert(
                    t("contacts.alerts.contactExists.title"),
                    t("contacts.alerts.alreadyInContacts")
                );
                return;
            }

            setIncomingRequests(prev => prev.filter(req => req.id !== requestId));
            await fetchAllData();

            Alert.alert(
                t("contacts.success.contactAdded.title"),
                t("contacts.success.contactAdded.message", {
                    name: requestData.sender_display_name || requestData.sender_email
                })
            );
        } catch (error: any) {
            console.error("Accept request error:", error);
            Alert.alert(t("errors.title"), error.message || t("contacts.errors.accept"));
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            const { data: requestData } = await supabase
                .from("contact_requests")
                .select("*")
                .eq("id", requestId)
                .eq("status", "pending")
                .maybeSingle();

            if (!requestData) {
                setIncomingRequests(prev => prev.filter(req => req.id !== requestId));
                Alert.alert(
                    t("contacts.alerts.requestHandled.title"),
                    t("contacts.alerts.requestHandled.message")
                );
                return;
            }

            const { error } = await supabase
                .from("contact_requests")
                .update({
                    status: 'rejected',
                    updated_at: new Date().toISOString()
                })
                .eq("id", requestId);

            if (error) throw error;

            setIncomingRequests(prev => prev.filter(req => req.id !== requestId));
            Alert.alert(
                t("contacts.success.requestRejected.title"),
                t("contacts.success.requestRejected.message")
            );
        } catch (error: any) {
            console.error("Reject request error:", error);
            setIncomingRequests(prev => prev.filter(req => req.id !== requestId));

            if (error.code === '23505') {
                Alert.alert(
                    t("contacts.alerts.requestHandled.title"),
                    t("contacts.alerts.requestHandled.message")
                );
            } else {
                Alert.alert(t("errors.title"), t("contacts.errors.reject"));
            }
        }
    };

    const handleCancelRequest = async (requestId: string) => {
        try {
            const { error } = await supabase
                .from("contact_requests")
                .delete()
                .eq("id", requestId);

            if (error) throw error;

            setOutgoingRequests(prev => prev.filter(req => req.id !== requestId));
            Alert.alert(
                t("contacts.success.requestCancelled.title"),
                t("contacts.success.requestCancelled.message")
            );
        } catch (error) {
            console.error("Cancel request error:", error);
            Alert.alert(t("errors.title"), t("contacts.errors.cancel"));
        }
    };

    const cleanupContactData = async () => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            const { data: acceptedRequests } = await supabase
                .from("contact_requests")
                .select("*")
                .or(`sender_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
                .eq("status", "accepted");

            if (acceptedRequests && acceptedRequests.length > 0) {
                for (const request of acceptedRequests) {
                    const otherUserId = request.sender_user_id === user.id
                        ? request.receiver_user_id
                        : request.sender_user_id;

                    const { data: contact } = await supabase
                        .from("contacts")
                        .select("*")
                        .eq("owner_user_id", user.id)
                        .eq("contact_user_id", otherUserId)
                        .maybeSingle();

                    if (!contact) {
                        await supabase
                            .from("contact_requests")
                            .delete()
                            .eq("id", request.id);
                    }
                }
            }

            const { data: allContacts } = await supabase
                .from("contacts")
                .select("*")
                .eq("owner_user_id", user.id);

            if (allContacts && allContacts.length > 0) {
                for (const contact of allContacts) {
                    const { data: acceptedRequest } = await supabase
                        .from("contact_requests")
                        .select("*")
                        .or(`and(sender_user_id.eq.${user.id},receiver_user_id.eq.${contact.contact_user_id}),and(sender_user_id.eq.${contact.contact_user_id},receiver_user_id.eq.${user.id})`)
                        .eq("status", "accepted")
                        .maybeSingle();

                    if (!acceptedRequest) {
                        await supabase
                            .from("contacts")
                            .delete()
                            .eq("id", contact.id);
                    }
                }
            }
        } catch (error) {
            console.error("Cleanup error:", error);
        }
    };

    const allContacts = [...existingContacts, ...newContacts];

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={getKeyboardVerticalOffset()}
            >
                {/* Header with Tabs */}
                <View style={styles.header}>
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tab, activeSection === 'contacts' && styles.activeTab]}
                            onPress={() => setActiveSection('contacts')}
                        >
                            <Ionicons
                                name="people"
                                size={20}
                                color={activeSection === 'contacts' ? "#5FA893" : "#9CA3AF"}
                            />
                            <Text style={[styles.tabText, activeSection === 'contacts' && styles.activeTabText]}>
                                {t("contacts.tabs.contacts")} {totalContactsCount > 0 && `(${totalContactsCount})`}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeSection === 'requests' && styles.activeTab]}
                            onPress={() => {
                                setActiveSection('requests');
                                setHasUnreadRequests(false);
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons
                                    name="mail"
                                    size={20}
                                    color={activeSection === 'requests' ? "#5FA893" : "#9CA3AF"}
                                />
                                {hasUnreadRequests && activeSection !== 'requests' && (
                                    <View style={styles.unreadBadge} />
                                )}
                            </View>
                            <Text style={[styles.tabText, activeSection === 'requests' && styles.activeTabText]}>
                                {t("contacts.tabs.requests")} {totalRequestsCount > 0 && `(${totalRequestsCount})`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {activeSection === 'contacts' ? (
                    <>
                        {/* Contacts Header */}
                        <View style={styles.contactsHeader}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerLeft}>
                                    <Text style={styles.title}>{t("contacts.title")}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <TouchableOpacity
                                        onPress={handleManualRefresh}
                                        style={styles.refreshButton}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        disabled={loading}
                                    >
                                        <Ionicons
                                            name="refresh"
                                            size={24}
                                            color={loading ? "#9CA3AF" : "#5FA893"}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={handleAddNewContact}
                                        style={styles.addButton}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        disabled={totalContactsCount >= 3}
                                    >
                                        <Ionicons
                                            name="add-circle"
                                            size={36}
                                            color={totalContactsCount >= 3 ? "#D1D5DB" : "#5FA893"}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <Text style={styles.subtitle}>
                                {totalContactsCount > 0
                                    ? t("contacts.subtitle.withContacts", { count: totalContactsCount })
                                    : t("contacts.subtitle.noContacts")
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
                                    <Text style={styles.loadingText}>{t("contacts.loading")}</Text>
                                </View>
                            ) : allContacts.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="people-outline" size={64} color="#D1D5DB" />
                                    <Text style={styles.emptyStateTitle}>{t("contacts.emptyState.title")}</Text>
                                    <Text style={styles.emptyStateText}>
                                        {t("contacts.emptyState.message")}
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

                        {/* Save Button */}
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
                                            <Ionicons name="send" size={18} color="#fff" style={styles.buttonIcon} />
                                        )}
                                        <Text style={styles.buttonText}>
                                            {saving
                                                ? t("contacts.buttons.sending")
                                                : t("contacts.buttons.sendRequests", { count: newContacts.length })
                                            }
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                ) : (
                    // Requests Section
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.requestsContent}
                    >
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <Ionicons
                                    name="refresh"
                                    size={36}
                                    color="#9CA3AF"
                                    style={styles.loadingIcon}
                                />
                                <Text style={styles.loadingText}>{t("contacts.requests.loading")}</Text>
                            </View>
                        ) : totalRequestsCount === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="mail-open-outline" size={64} color="#D1D5DB" />
                                <Text style={styles.emptyStateTitle}>{t("contacts.requests.emptyState.title")}</Text>
                                <Text style={styles.emptyStateText}>
                                    {t("contacts.requests.emptyState.message")}
                                </Text>
                            </View>
                        ) : (
                            <>
                                {incomingRequests.length > 0 && (
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle}>{t("contacts.requests.received")}</Text>
                                        {incomingRequests.map(request => (
                                            <ContactRequestCard
                                                key={request.id}
                                                request={request}
                                                onAccept={() => handleAcceptRequest(request.id)}
                                                onReject={() => handleRejectRequest(request.id)}
                                                onCancel={() => { }}
                                                isOutgoing={false}
                                            />
                                        ))}
                                    </View>
                                )}
                                {outgoingRequests.length > 0 && (
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle}>{t("contacts.requests.sent")}</Text>
                                        {outgoingRequests.map(request => (
                                            <ContactRequestCard
                                                key={request.id}
                                                request={request}
                                                onAccept={() => { }}
                                                onReject={() => { }}
                                                onCancel={() => handleCancelRequest(request.id)}
                                                isOutgoing={true}
                                            />
                                        ))}
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
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
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
    },
    activeTab: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#9CA3AF',
        marginLeft: 6,
    },
    activeTabText: {
        color: '#1F2937',
    },
    unreadBadge: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        marginLeft: 4,
        marginTop: -8,
    },
    contactsHeader: {
        paddingHorizontal: 20,
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
        color: "#1F2937",
    },
    refreshButton: {
        padding: 4,
        marginRight: 12,
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
    requestsContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
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
    requestCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
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
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    requestInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    requestTextContainer: {
        marginLeft: 12,
        flex: 1,
    },
    requestName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 2,
    },
    requestEmail: {
        fontSize: 14,
        color: '#6B7280',
    },
    requestTime: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    requestMessage: {
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#5FA893',
    },
    requestMessageText: {
        fontSize: 14,
        color: '#4B5563',
        fontStyle: 'italic',
    },
    requestActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    requestButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    acceptButton: {
        backgroundColor: '#5FA893',
    },
    rejectButton: {
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    acceptButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 6,
    },
    rejectButtonText: {
        color: '#4B5563',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 6,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
    },
    cancelButtonText: {
        color: '#9CA3AF',
        fontWeight: '600',
        fontSize: 14,
        marginLeft: 6,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 12,
    },
});