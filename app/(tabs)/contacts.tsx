// screens/ContactsScreen.tsx
import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
import { sendContactRequestNotification } from '@/lib/notifications';
import { useContactStore } from '@/stores/contactStore';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getUsernameValidationMessage, normalizeUsername } from '../../lib/profile/username';
import { supabase } from '../../lib/supabase';
import { iosFontSize } from '@/constants/typography';

type ContactSlot = {
    identifier?: string;
    email: string;
    username?: string;
    user_id?: string;
    display_name?: string;
    avatar_url?: string | null;
    id?: string;
    checkin_notifications_enabled?: boolean;
    location_sharing_enabled?: boolean;
    toggling_notifications?: boolean;
    toggling_location?: boolean;
};

type ContactRequest = {
    id: string;
    sender_user_id: string;
    receiver_user_id: string;
    sender_email: string;
    sender_display_name?: string;
    sender_username?: string;
    receiver_username?: string;
    message?: string;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: string;
};

interface UserSearchResult {
    user_id: string;
    email: string;
    display_name: string;
    username?: string | null;
    avatar_url?: string | null;
}

type ContactProfileRow = {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
};

type GeneratedInvite = {
    invite_token: string;
    invite_code: string;
    expires_at: string;
    invite_kind?: 'signup' | 'recovery';
    suggested_username?: string | null;
    target_display_name?: string | null;
    target_username?: string | null;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const getKeyboardVerticalOffset = () => {
    if (Platform.OS === 'ios') {
        if (SCREEN_HEIGHT < 700) return 60;
        if (SCREEN_HEIGHT < 800) return 80;
        return 90;
    }
    return 0;
};

const ContactCard = memo(
    ({
        contact,
        index,
        isActive,
        onIdentifierChange,
        onFocus,
        onBlur,
        onRemove,
        onToggleCheckinNotifications,
        onToggleLocationSharing,
        onCreateRecoveryInvite,
        showCheckinNotificationControl,
        showLocationSharingControl,
        inputRef,
        isNewContact,
    }: {
        contact: ContactSlot;
        index: number;
        isActive: boolean;
        onIdentifierChange: (text: string) => void;
        onFocus: () => void;
        onBlur: () => void;
        onRemove: () => void;
        onToggleCheckinNotifications?: (value: boolean) => void;
        onToggleLocationSharing?: (value: boolean) => void;
        onCreateRecoveryInvite?: () => void;
        showCheckinNotificationControl: boolean;
        showLocationSharingControl: boolean;
        inputRef: (ref: TextInput | null) => void;
        isNewContact: boolean;
    }) => {
        const { t } = useTranslation();
        const existingName =
            contact.display_name?.trim() || contact.username || contact.identifier || contact.email;
        const existingIdentifier = contact.username || contact.identifier;

        return (
            <View
                style={[
                    styles.card,
                    !isNewContact && styles.existingContactCardWrapper,
                    isActive && styles.cardActive,
                ]}
            >
                {isNewContact ? (
                    <>
                        <View style={styles.cardHeader}>
                            <View style={styles.cardTitle}>
                                <View style={styles.cardNumber}>
                                    <Text style={styles.cardNumberText}>{index + 1}</Text>
                                </View>
                                <Text style={styles.cardTitleText}>{t('contacts.newContact')}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={onRemove}
                                style={styles.removeButton}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name="close-circle"
                                    size={21}
                                    color={BaseColors.neutral[400]}
                                />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            ref={inputRef}
                            placeholder={t('contacts.placeholders.identifier')}
                            placeholderTextColor={BaseColors.neutral[400]}
                            value={contact.identifier || ''}
                            onChangeText={onIdentifierChange}
                            onFocus={onFocus}
                            onBlur={onBlur}
                            autoCapitalize="none"
                            autoCorrect={false}
                            spellCheck={false}
                            style={styles.input}
                        />

                        {contact.display_name && contact.display_name.trim() !== '' && (
                            <View style={styles.displayNameContainer}>
                                <Ionicons
                                    name="checkmark-circle"
                                    size={18}
                                    color={BaseColors.primary}
                                />
                                <Text style={styles.displayNameText}>
                                    {t('contacts.displayingAs')} {contact.display_name}
                                </Text>
                            </View>
                        )}
                    </>
                ) : (
                    <View style={styles.existingContactCard}>
                        <View style={styles.existingContactHeading}>
                            <View style={styles.existingContactTitleRow}>
                                <View style={styles.cardNumber}>
                                    <Text style={styles.cardNumberText}>{index + 1}</Text>
                                </View>
                                <Text style={styles.displayNameMain} numberOfLines={2}>
                                    {existingName}
                                </Text>
                                {existingIdentifier ? (
                                    <Text style={styles.contactIdInline} numberOfLines={1}>
                                        @{existingIdentifier}
                                    </Text>
                                ) : null}
                            </View>
                        </View>
                        <View style={styles.existingContactInfo}>
                            <View style={styles.existingContactMainRow}>
                                {contact.avatar_url ? (
                                    <Image
                                        source={{ uri: contact.avatar_url }}
                                        style={styles.contactAvatar}
                                    />
                                ) : (
                                    <View style={styles.contactAvatarFallback}>
                                        <Ionicons
                                            name="person"
                                            size={22}
                                            color={BaseColors.primary}
                                        />
                                    </View>
                                )}

                                <View style={styles.cardHeaderActions}>
                                    {showCheckinNotificationControl && (
                                        <TouchableOpacity
                                            style={[
                                                styles.headerActionButton,
                                                contact.checkin_notifications_enabled === false &&
                                                    styles.notificationToggleDisabled,
                                            ]}
                                            onPress={() =>
                                                onToggleCheckinNotifications?.(
                                                    !(contact.checkin_notifications_enabled !== false)
                                                )
                                            }
                                            disabled={contact.toggling_notifications}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={
                                                    contact.checkin_notifications_enabled !== false
                                                        ? 'notifications'
                                                        : 'notifications-outline'
                                                }
                                                size={22}
                                                color={
                                                    contact.checkin_notifications_enabled !== false
                                                        ? BaseColors.primary
                                                        : BaseColors.error
                                                }
                                            />
                                            {contact.checkin_notifications_enabled === false && (
                                                <View style={styles.notificationToggleSlash} />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                    {showLocationSharingControl && (
                                        <TouchableOpacity
                                            style={[
                                                styles.headerActionButton,
                                                contact.location_sharing_enabled === true &&
                                                    styles.locationToggleEnabled,
                                                contact.location_sharing_enabled !== true &&
                                                    styles.locationToggleDisabled,
                                            ]}
                                            onPress={() =>
                                                onToggleLocationSharing?.(
                                                    !(contact.location_sharing_enabled === true)
                                                )
                                            }
                                            disabled={contact.toggling_location}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={
                                                    contact.location_sharing_enabled === true
                                                        ? 'location'
                                                        : 'location-outline'
                                                }
                                                size={22}
                                                color={
                                                    contact.location_sharing_enabled === true
                                                        ? BaseColors.primaryDark
                                                        : BaseColors.error
                                                }
                                            />
                                            {contact.location_sharing_enabled !== true && (
                                                <View style={styles.locationToggleSlash} />
                                            )}
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={styles.headerActionButton}
                                        onPress={onCreateRecoveryInvite}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons
                                            name="key-outline"
                                            size={22}
                                            color={BaseColors.primary}
                                        />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={onRemove}
                                        style={styles.removeButton}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <Ionicons
                                            name="trash-outline"
                                            size={21}
                                            color={BaseColors.error}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    }
);

const ContactRequestCard = memo(
    ({
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
        const { t } = useTranslation();

        const getTimeAgo = (dateString: string) => {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return t('time.justNow');
            if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
            if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
            if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
            return date.toLocaleDateString();
        };

        return (
            <View style={styles.requestCard}>
                <View style={styles.requestHeader}>
                    <View style={styles.requestInfo}>
                        <Ionicons
                            name={isOutgoing ? 'person-add-outline' : 'person-outline'}
                            size={20}
                            color={BaseColors.neutral[500]}
                        />
                        <View style={styles.requestTextContainer}>
                            <Text style={styles.requestName}>
                                {isOutgoing
                                    ? t('contacts.requests.waiting')
                                    : request.sender_display_name || 'User'}
                            </Text>
                            <Text style={styles.requestEmail}>
                                {isOutgoing
                                    ? request.receiver_username || request.receiver_user_id
                                    : request.sender_username || ''}
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
                    <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
                        <Ionicons
                            name="close-circle"
                            size={18}
                            color={BaseColors.neutral[400]}
                        />
                        <Text style={styles.cancelButtonText}>
                            {t('contacts.buttons.cancelRequest')}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.requestActions}>
                        <TouchableOpacity
                            onPress={onAccept}
                            style={[styles.requestButton, styles.acceptButton]}
                        >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.acceptButtonText}>
                                {t('contacts.buttons.accept')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onReject}
                            style={[styles.requestButton, styles.rejectButton]}
                        >
                            <Ionicons name="close" size={18} color={BaseColors.neutral[400]} />
                            <Text style={styles.rejectButtonText}>
                                {t('contacts.buttons.reject')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    }
);

export default function ContactsScreen() {
    const { t } = useTranslation();
    const { capabilities } = useAuth();
    const [existingContacts, setExistingContacts] = useState<ContactSlot[]>([]);
    const [newContacts, setNewContacts] = useState<ContactSlot[]>([]);
    const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const [inviteShareVisible, setInviteShareVisible] = useState(false);
    const [suggestedInviteUsername, setSuggestedInviteUsername] = useState('');
    const [generatedInvite, setGeneratedInvite] = useState<GeneratedInvite | null>(null);
    const suggestedInviteValidationMessage = useMemo(
        () => getUsernameValidationMessage(suggestedInviteUsername, t),
        [suggestedInviteUsername, t]
    );
    const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
    const [activeSection, setActiveSection] = useState<'contacts' | 'requests'>(
        'contacts'
    );

    const { setUnreadCount, incrementUnread, resetUnread, unreadCount } = useContactStore();
    const scrollViewRef = useRef<ScrollView>(null);
    const inputRefs = useRef<(TextInput | null)[]>([]);
    const isMountedRef = useRef(true);
    const lastFetchRef = useRef<number>(0);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const totalContactsCount = existingContacts.length + newContacts.length;
    const totalRequestsCount = incomingRequests.length + outgoingRequests.length;

    const getUserIdentity = useCallback(async (userId: string) => {
        const { data: rows } = await supabase.rpc(
            'get_contact_usernames',
            { contact_ids: [userId] }
        ) as { data: ContactProfileRow[] | null };

        const row = rows?.[0];

        return {
            display_name: row?.display_name || '',
            username: row?.username || '',
            avatar_url: row?.avatar_url || '',
        };
    }, []);

    // Single source of truth for data fetching
    const fetchAllData = useCallback(async (showLoadingState = false) => {
        // Prevent too frequent fetches (minimum 2 seconds between fetches)
        const now = Date.now();
        if (now - lastFetchRef.current < 2000 && lastFetchRef.current !== 0) {
            console.log('⏳ Skipping fetch - too frequent');
            return;
        }

        if (showLoadingState) {
            setIsRefreshing(true);
        }

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            // Fetch everything in parallel for better performance
            const [contactsResult, incomingResult, outgoingResult] = await Promise.all([
                supabase
                    .from('contacts')
                    .select('id, contact_user_id, contact_email, contact_display_name, checkin_notifications_enabled, location_sharing_enabled')
                    .eq('owner_user_id', user.id)
                    .order('created_at'),

                supabase
                    .from('contact_requests')
                    .select('*')
                    .eq('receiver_user_id', user.id)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false }),

                supabase
                    .from('contact_requests')
                    .select('*')
                    .eq('sender_user_id', user.id)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false })
            ]);

            if (isMountedRef.current) {
                const contactUserIds =
                    contactsResult.data
                        ?.map((row) => row.contact_user_id)
                        .filter(Boolean) || [];
                const requestUserIds = [
                    ...(incomingResult.data?.map((row) => row.sender_user_id).filter(Boolean) || []),
                    ...(outgoingResult.data?.map((row) => row.receiver_user_id).filter(Boolean) || []),
                ];
                const uniqueUserIds = [...new Set([...contactUserIds, ...requestUserIds])];

                let usernameMap = new Map<string, string>();
                let displayNameMap = new Map<string, string>();
                let avatarMap = new Map<string, string>();

                if (uniqueUserIds.length > 0) {
                    const { data: profileRows } = await supabase.rpc(
                        'get_contact_usernames',
                        { contact_ids: uniqueUserIds }
                    ) as { data: ContactProfileRow[] | null };

                    usernameMap = new Map(
                        (profileRows || [])
                            .filter((row) => row.username)
                            .map((row) => [row.id, row.username as string])
                    );
                    displayNameMap = new Map(
                        (profileRows || [])
                            .filter((row) => row.display_name && row.display_name.trim() !== '')
                            .map((row) => [row.id, row.display_name as string])
                    );
                    avatarMap = new Map(
                        (profileRows || [])
                            .filter((row) => row.avatar_url && row.avatar_url.trim() !== '')
                            .map((row) => [row.id, row.avatar_url as string])
                    );
                }

                // Transform contacts
                const contacts: ContactSlot[] =
                    contactsResult.data?.map((row) => ({
                        id: row.id,
                        user_id: row.contact_user_id,
                        identifier:
                            usernameMap.get(row.contact_user_id) ||
                            '',
                        email: row.contact_email || '',
                        username: usernameMap.get(row.contact_user_id),
                        display_name:
                            displayNameMap.get(row.contact_user_id) ||
                            row.contact_display_name ||
                            '',
                        avatar_url: avatarMap.get(row.contact_user_id) || null,
                        checkin_notifications_enabled:
                            row.checkin_notifications_enabled !== false,
                        location_sharing_enabled:
                            row.location_sharing_enabled === true,
                    })) || [];

                setExistingContacts(contacts);
                setIncomingRequests(
                    (incomingResult.data || []).map((request) => ({
                        ...request,
                        sender_display_name:
                            displayNameMap.get(request.sender_user_id) ||
                            request.sender_display_name,
                        sender_username: usernameMap.get(request.sender_user_id),
                    }))
                );
                setOutgoingRequests(
                    (outgoingResult.data || []).map((request) => ({
                        ...request,
                        sender_display_name:
                            displayNameMap.get(request.sender_user_id) ||
                            request.sender_display_name,
                        receiver_username: usernameMap.get(request.receiver_user_id),
                    }))
                );

                lastFetchRef.current = Date.now();
            }
        } catch (error) {
            console.error('Fetch data error:', error);
            if (isMountedRef.current) {
                Alert.alert(t('errors.title'), t('contacts.errors.loadData'));
            }
        } finally {
            if (isMountedRef.current) {
                setIsInitialLoading(false);
                setIsRefreshing(false);
            }
        }
    }, [t]);

    const checkUnreadRequests = useCallback(async () => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            const { data: requests } = await supabase
                .from('contact_requests')
                .select('id, created_at')
                .eq('receiver_user_id', user.id)
                .eq('status', 'pending')
                .gte(
                    'created_at',
                    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                );

            const lastViewed = await AsyncStorage.getItem('last_viewed_requests');
            const unreadCount =
                requests?.filter((request) => {
                    if (!lastViewed) return true;
                    return new Date(request.created_at) > new Date(lastViewed);
                }).length || 0;

            setUnreadCount(unreadCount);
        } catch (error) {
            console.error('Check unread requests error:', error);
        }
    }, [setUnreadCount]);

    // Initial load - only once
    useEffect(() => {
        isMountedRef.current = true;

        const initialize = async () => {
            await fetchAllData(true);
            await checkUnreadRequests();
            cleanupContactData();
        };

        initialize();

        return () => {
            isMountedRef.current = false;
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, []); // Empty dependency array - only run once

    // Smart focus effect - only fetch if data is stale (> 30 seconds)
    useFocusEffect(
        useCallback(() => {
            const now = Date.now();
            const timeSinceLastFetch = now - lastFetchRef.current;

            // Only fetch if data is stale (older than 30 seconds) or no data
            if (timeSinceLastFetch > 30000 || existingContacts.length === 0) {
                console.log('🎯 Data stale, refreshing...');
                fetchAllData(false);
                checkUnreadRequests();
            } else {
                console.log('🎯 Using cached data');
            }

            // Check unread requests without full refresh
            checkUnreadRequests();
        }, [fetchAllData, checkUnreadRequests, existingContacts.length])
    );

    // App state effect - debounced refresh
    useEffect(() => {
        let isActive = true;

        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === 'active' && isActive) {
                console.log('📱 App became active - checking data freshness');

                // Debounce app state refreshes
                if (fetchTimeoutRef.current) {
                    clearTimeout(fetchTimeoutRef.current);
                }

                fetchTimeoutRef.current = setTimeout(() => {
                    if (isMountedRef.current) {
                        const timeSinceLastFetch = Date.now() - lastFetchRef.current;
                        if (timeSinceLastFetch > 10000) { // Only refresh if >10 seconds
                            fetchAllData(false);
                            checkUnreadRequests();
                        }
                    }
                }, 500);
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            isActive = false;
            subscription.remove();
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, [fetchAllData, checkUnreadRequests]);

    // Optimized real-time subscriptions
    useEffect(() => {
        let contactRequestsSubscription: any = null;
        let contactsSubscription: any = null;

        const setupSubscriptions = async () => {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            // Contact requests subscription
            contactRequestsSubscription = supabase
                .channel(`contact_requests:${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'contact_requests',
                        filter: `receiver_user_id=eq.${user.id}`,
                    },
                    (payload) => {
                        console.log('🔔 New request received!');
                        incrementUnread();
                        const request = payload.new as ContactRequest;

                        void (async () => {
                            const identity = await getUserIdentity(request.sender_user_id);
                            const enrichedRequest: ContactRequest = {
                                ...request,
                                sender_display_name:
                                    identity.display_name || request.sender_display_name,
                                sender_username:
                                    identity.username || request.sender_username,
                            };

                            if (isMountedRef.current) {
                                setIncomingRequests(prev => [enrichedRequest, ...prev]);
                            }
                        })();
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
                    () => {
                        // Debounce these updates
                        if (fetchTimeoutRef.current) {
                            clearTimeout(fetchTimeoutRef.current);
                        }
                        fetchTimeoutRef.current = setTimeout(() => {
                            if (isMountedRef.current) {
                                fetchAllData(false);
                            }
                        }, 1000);
                    }
                )
                .subscribe();

            // Contacts subscription - only refresh if it's a change we care about
            contactsSubscription = supabase
                .channel(`contacts:${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'contacts',
                        filter: `owner_user_id=eq.${user.id}`,
                    },
                    () => {
                        // Debounce contacts updates
                        if (fetchTimeoutRef.current) {
                            clearTimeout(fetchTimeoutRef.current);
                        }
                        fetchTimeoutRef.current = setTimeout(() => {
                            if (isMountedRef.current) {
                                fetchAllData(false);
                            }
                        }, 1000);
                    }
                )
                .subscribe();
        };

        setupSubscriptions();

        return () => {
            if (contactRequestsSubscription) {
                contactRequestsSubscription.unsubscribe();
            }
            if (contactsSubscription) {
                contactsSubscription.unsubscribe();
            }
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
        };
    }, [fetchAllData, getUserIdentity, incrementUnread]); // Empty dependency - run once

    // Pull-to-refresh handler
    const handleManualRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await fetchAllData(true);
        await checkUnreadRequests();
    }, [fetchAllData, checkUnreadRequests]);

    // Mark requests as read when viewing
    useEffect(() => {
        const markAsRead = async () => {
            if (activeSection === 'requests' && unreadCount > 0) {
                await AsyncStorage.setItem(
                    'last_viewed_requests',
                    new Date().toISOString()
                );
                resetUnread();
            }
        };
        markAsRead();
    }, [activeSection, unreadCount, resetUnread]);

    const handleAddNewContact = () => {
        if (totalContactsCount >= capabilities.maxContacts) {
            Alert.alert(
                t('contacts.alerts.limitReached.title'),
                t('contacts.alerts.limitReached.message'),
                [{ text: t('common.ok') }]
            );
            return;
        }

        const newContactIndex = totalContactsCount;
        setNewContacts((prev) => [...prev, { identifier: '', email: '' }]);

        setTimeout(() => {
            const inputRef = inputRefs.current[newContactIndex];
            if (inputRef) {
                inputRef.focus();
            }
        }, 150);
    };

    const handleCreateInvite = useCallback(async () => {
        if (totalContactsCount >= capabilities.maxContacts) {
            Alert.alert(
                t('contacts.alerts.limitReached.title'),
                t('contacts.alerts.limitReached.message'),
                [{ text: t('common.ok') }]
            );
            return;
        }

        setCreatingInvite(true);
        try {
            const normalizedSuggestedUsername = normalizeUsername(suggestedInviteUsername);
            const { data, error } = await supabase
                .rpc('create_contact_invite', {
                    p_suggested_username: normalizedSuggestedUsername || null,
                })
                .single();

            if (error) throw error;
            if (!data) throw new Error(t('contacts.errors.createInvite'));

            setGeneratedInvite({
                invite_token: data.invite_token,
                invite_code: data.invite_code,
                expires_at: data.expires_at,
                suggested_username: data.suggested_username || normalizedSuggestedUsername || null,
            });
            setInviteModalVisible(false);
            setInviteShareVisible(true);
            setSuggestedInviteUsername('');
        } catch (error: any) {
            Alert.alert(t('errors.title'), error.message || t('contacts.errors.createInvite'));
        } finally {
            setCreatingInvite(false);
        }
    }, [capabilities.maxContacts, suggestedInviteUsername, t, totalContactsCount]);

    const handleShareInviteLink = useCallback(async () => {
        if (!generatedInvite) return;

        const inviteUrl = `https://tryggd.com/invite?token=${generatedInvite.invite_token}`;
        try {
            await Share.share({
                message:
                    generatedInvite.invite_kind === 'recovery'
                        ? `${t('contacts.invite.recoveryShareMessage')} ${inviteUrl}`
                        : `${t('contacts.invite.shareMessage')} ${inviteUrl}`,
                url: inviteUrl,
            });
        } catch (error: any) {
            Alert.alert(t('errors.title'), error.message || t('contacts.errors.shareInvite'));
        }
    }, [generatedInvite, t]);

    const handleCreateRecoveryInvite = useCallback(async (contact: ContactSlot) => {
        if (!contact.user_id) {
            Alert.alert(t('errors.title'), t('contacts.errors.recoveryUnavailable'));
            return;
        }

        try {
            const { data, error } = await supabase
                .rpc('create_contact_recovery_invite', {
                    p_contact_user_id: contact.user_id,
                })
                .single();

            if (error) throw error;
            if (!data) throw new Error(t('contacts.errors.createRecoveryInvite'));

            setGeneratedInvite({
                invite_token: data.invite_token,
                invite_code: data.invite_code,
                expires_at: data.expires_at,
                invite_kind: 'recovery',
                target_display_name: data.target_display_name || contact.display_name || null,
                target_username: data.target_username || contact.username || contact.identifier || null,
                suggested_username: data.target_username || contact.username || contact.identifier || null,
            });
            setInviteShareVisible(true);
        } catch (error: any) {
            Alert.alert(t('errors.title'), error.message || t('contacts.errors.createRecoveryInvite'));
        }
    }, [t]);

    const updateNewContact = useCallback((index: number, identifier: string) => {
        setNewContacts((prev) =>
            prev.map((contact, i) =>
                i === index
                    ? { ...contact, identifier, display_name: undefined, user_id: undefined, username: undefined }
                    : contact
            )
        );
    }, []);

    const handleInputFocus = useCallback(
        (index: number) => {
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
        },
        [totalContactsCount]
    );

    const handleInputBlur = useCallback(
        (index: number) => {
            setActiveInputIndex(null);

            if (index >= existingContacts.length) {
                const newContactIndex = index - existingContacts.length;
                setNewContacts((prev) => {
                    const contact = prev[newContactIndex];
                    if (contact && (!contact.identifier || contact.identifier.trim() === '')) {
                        return prev.filter((_, i) => i !== newContactIndex);
                    }
                    return prev;
                });
            }
        },
        [existingContacts.length]
    );

    const removeNewContact = useCallback((index: number) => {
        setNewContacts((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const removeExistingContact = useCallback(
        async (index: number) => {
            const contact = existingContacts[index];

            Alert.alert(
                t('contacts.alerts.delete.title'),
                t('contacts.alerts.delete.message', {
                    name: contact.display_name || contact.username || contact.identifier || contact.email,
                }),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                        text: t('contacts.buttons.delete'),
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                const { data: userData } = await supabase.auth.getUser();
                                const user = userData.user;
                                if (!user || !contact.user_id) return;

                                const { data, error } = await supabase.rpc(
                                    'completely_remove_relationship',
                                    {
                                        p_user1_id: user.id,
                                        p_user2_id: contact.user_id,
                                    }
                                );

                                if (error) {
                                    await deleteEverythingManually(user.id, contact.user_id);
                                } else if (data?.error) {
                                    await deleteEverythingManually(user.id, contact.user_id);
                                } else {
                                    console.log('Relationship completely removed:', data);
                                }

                                setExistingContacts((prev) =>
                                    prev.filter((_, i) => i !== index)
                                );
                                Alert.alert(
                                    t('contacts.success.deleted.title'),
                                    t('contacts.success.deleted.message', {
                                        name: contact.display_name || contact.username || contact.identifier || contact.email,
                                    })
                                );
                            } catch (error: any) {
                                console.error('Delete error:', error);
                                Alert.alert(t('errors.title'), t('contacts.errors.delete'));
                            }
                        },
                    },
                ]
            );
        },
        [existingContacts]
    );

    const toggleContactCheckinNotifications = useCallback(
        async (index: number, enabled: boolean) => {
            const contact = existingContacts[index];
            if (!contact?.id) return;

            setExistingContacts((prev) =>
                prev.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                            ...item,
                            checkin_notifications_enabled: enabled,
                            toggling_notifications: true,
                        }
                        : item
                )
            );

            const { data, error } = await supabase
                .from('contacts')
                .update({ checkin_notifications_enabled: enabled })
                .eq('id', contact.id)
                .select('id, checkin_notifications_enabled')
                .single();

            if (error) {
                console.error('Toggle check-in notifications error:', error);
                setExistingContacts((prev) =>
                    prev.map((item, itemIndex) =>
                        itemIndex === index
                            ? {
                                ...item,
                                checkin_notifications_enabled:
                                    contact.checkin_notifications_enabled !== false,
                                toggling_notifications: false,
                            }
                            : item
                    )
                );
                Alert.alert(
                    t('errors.title'),
                error.message || t('contacts.errors.updateCheckinNotifications')
                );
                return;
            }

            if (!data) {
                setExistingContacts((prev) =>
                    prev.map((item, itemIndex) =>
                        itemIndex === index
                            ? {
                                ...item,
                                checkin_notifications_enabled:
                                    contact.checkin_notifications_enabled !== false,
                                toggling_notifications: false,
                            }
                            : item
                    )
                );
                Alert.alert(t('errors.title'), t('contacts.errors.noContactUpdated'));
                return;
            }

            setExistingContacts((prev) =>
                prev.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                            ...item,
                            checkin_notifications_enabled:
                                data.checkin_notifications_enabled !== false,
                            toggling_notifications: false,
                        }
                        : item
                )
            );

            Alert.alert(
                data.checkin_notifications_enabled !== false
                    ? t('contacts.status.checkinsEnabled', {
                        name: contact.display_name || contact.username || t('contacts.messages.contactDefault'),
                      })
                    : t('contacts.status.checkinsDisabled', {
                        name: contact.display_name || contact.username || t('contacts.messages.contactDefault'),
                      })
            );

            await fetchAllData();
        },
        [existingContacts, fetchAllData, t]
    );

    const toggleContactLocationSharing = useCallback(
        async (index: number, enabled: boolean) => {
            const contact = existingContacts[index];
            if (!contact?.id) return;

            setExistingContacts((prev) =>
                prev.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                            ...item,
                            location_sharing_enabled: enabled,
                            toggling_location: true,
                        }
                        : item
                )
            );

            const { data, error } = await supabase
                .from('contacts')
                .update({ location_sharing_enabled: enabled })
                .eq('id', contact.id)
                .select('id, location_sharing_enabled')
                .single();

            if (error) {
                console.error('Toggle location sharing error:', error);
                setExistingContacts((prev) =>
                    prev.map((item, itemIndex) =>
                        itemIndex === index
                            ? {
                                ...item,
                                location_sharing_enabled:
                                    contact.location_sharing_enabled === true,
                                toggling_location: false,
                            }
                            : item
                    )
                );
                Alert.alert(
                    t('errors.title'),
                error.message || t('contacts.errors.updateLocationSharing')
                );
                return;
            }

            if (!data) {
                setExistingContacts((prev) =>
                    prev.map((item, itemIndex) =>
                        itemIndex === index
                            ? {
                                ...item,
                                location_sharing_enabled:
                                    contact.location_sharing_enabled === true,
                                toggling_location: false,
                            }
                            : item
                    )
                );
                Alert.alert(t('errors.title'), t('contacts.errors.noContactUpdated'));
                return;
            }

            setExistingContacts((prev) =>
                prev.map((item, itemIndex) =>
                    itemIndex === index
                        ? {
                            ...item,
                            location_sharing_enabled:
                                data.location_sharing_enabled === true,
                            toggling_location: false,
                        }
                        : item
                )
            );

            Alert.alert(
                data.location_sharing_enabled === true
                    ? t('contacts.status.locationEnabled', {
                        name: contact.display_name || contact.username || t('contacts.messages.contactDefault'),
                      })
                    : t('contacts.status.locationDisabled', {
                        name: contact.display_name || contact.username || t('contacts.messages.contactDefault'),
                      })
            );

            await fetchAllData();
        },
        [existingContacts, fetchAllData, t]
    );

    const deleteEverythingManually = async (userId1: string, userId2: string) => {
        try {
            const { error: contactsError } = await supabase
                .from('contacts')
                .delete()
                .or(
                    `and(owner_user_id.eq.${userId1},contact_user_id.eq.${userId2}),and(owner_user_id.eq.${userId2},contact_user_id.eq.${userId1})`
                );

            if (contactsError) {
                await supabase
                    .from('contacts')
                    .delete()
                    .eq('owner_user_id', userId1)
                    .eq('contact_user_id', userId2);
            }

            const { error: requestsError } = await supabase
                .from('contact_requests')
                .delete()
                .or(
                    `and(sender_user_id.eq.${userId1},receiver_user_id.eq.${userId2}),and(sender_user_id.eq.${userId2},receiver_user_id.eq.${userId1})`
                );

            if (requestsError) {
                console.error('Requests deletion error:', requestsError);
            }
        } catch (error) {
            console.error('Manual deletion failed:', error);
            throw error;
        }
    };

    const sendContactRequest = async (contact: ContactSlot) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user || !contact.user_id) return;

            const { data: existingContact } = await supabase
                .from('contacts')
                .select('*')
                .eq('owner_user_id', user.id)
                .eq('contact_user_id', contact.user_id)
                .maybeSingle();

            if (existingContact) {
                Alert.alert(
                    t('contacts.alerts.contactExists.title'),
                    t('contacts.alerts.contactExists.message', {
                        name: contact.display_name || contact.username || contact.identifier || contact.email,
                    })
                );
                return;
            }

            const { data: existingRequest } = await supabase
                .from('contact_requests')
                .select('*')
                .or(
                    `and(sender_user_id.eq.${user.id},receiver_user_id.eq.${contact.user_id}),and(sender_user_id.eq.${contact.user_id},receiver_user_id.eq.${user.id})`
                )
                .maybeSingle();

            if (existingRequest) {
                if (
                    existingRequest.status === 'pending' &&
                    existingRequest.sender_user_id === user.id
                ) {
                    Alert.alert(
                        t('contacts.alerts.requestExists.title'),
                        t('contacts.alerts.requestExists.message')
                    );
                    return;
                }

                if (
                    existingRequest.status === 'pending' &&
                    existingRequest.receiver_user_id === user.id
                ) {
                    Alert.alert(
                        t('contacts.alerts.requestReceived.title'),
                        t('contacts.alerts.requestReceived.message', {
                            email: contact.username || contact.identifier || contact.email,
                        })
                    );
                    return;
                }

                if (
                    existingRequest.status === 'accepted' ||
                    existingRequest.status === 'rejected'
                ) {
                    await supabase
                        .from('contact_requests')
                        .delete()
                        .eq('id', existingRequest.id);
                }
            }

            const senderIdentity = await getUserIdentity(user.id);
            const senderDisplayName =
                senderIdentity.display_name ||
                user.user_metadata?.display_name ||
                user.user_metadata?.name ||
                user.email?.split('@')[0] ||
                'User';

            const { data, error } = await supabase
                .from('contact_requests')
                .insert({
                    sender_user_id: user.id,
                    receiver_user_id: contact.user_id,
                    sender_email: user.email || '',
                    sender_display_name: senderDisplayName,
                    status: 'pending',
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    const { data: duplicateCheck } = await supabase
                        .from('contact_requests')
                        .select('*')
                        .eq('sender_user_id', user.id)
                        .eq('receiver_user_id', contact.user_id)
                        .maybeSingle();

                    if (duplicateCheck) {
                        Alert.alert(
                            t('contacts.alerts.requestExists.title'),
                            t('contacts.alerts.requestExists.message')
                        );
                        return;
                    }
                }

                throw error;
            }
            await sendContactRequestNotification({
                receiverUserId: contact.user_id,
                senderUserId: user.id,
                senderName: senderDisplayName,
                senderEmail: user.email || '',
                requestId: data.id,
            });

            setOutgoingRequests((prev) => [data, ...prev]);
            Alert.alert(
                t('contacts.success.requestSent.title'),
                t('contacts.success.requestSent.message', {
                    name: contact.display_name || contact.username || contact.identifier || contact.email,
                })
            );
        } catch (error) {
            console.error('Send request error:', error);
            Alert.alert(t('errors.title'), t('contacts.errors.sendRequest'));
        }
    };

    const saveNewContacts = async () => {
        inputRefs.current.forEach((ref) => ref?.blur());

        const validNewContacts = newContacts.filter(
            (contact) => contact.identifier && contact.identifier.trim() !== ''
        );

        if (validNewContacts.length === 0) {
            Alert.alert(
                t('contacts.alerts.noChanges.title'),
                t('contacts.alerts.noChanges.message')
            );
            return;
        }

        if (existingContacts.length + validNewContacts.length > capabilities.maxContacts) {
            Alert.alert(
                t('contacts.alerts.limitReached.title'),
                t('contacts.alerts.limitReached.message'),
                [{ text: t('common.ok') }]
            );
            return;
        }

        setSaving(true);

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) throw new Error(t('errors.notAuthenticated'));

            const resolved: ContactSlot[] = [];

            for (const c of validNewContacts) {
                const rawInput = c.identifier!.trim();
                if (!rawInput) continue;

                const isEmailLookup = rawInput.includes('@');
                const usernameToSearch = rawInput.replace(/^@/, '');
                const lookupValue = isEmailLookup ? rawInput.toLowerCase() : usernameToSearch.toLowerCase();

                const { data: userResult, error } = (await supabase
                    .rpc(isEmailLookup ? 'find_contact_by_email' : 'find_contact_by_username', isEmailLookup
                        ? { search_email: lookupValue }
                        : { search_username: lookupValue })
                    .single()) as { data: UserSearchResult | null; error: any };

                if (error) {
                    Alert.alert(t('errors.title'), t('contacts.errors.search'));
                    return;
                }

                if (!userResult) {
                    Alert.alert(
                        isEmailLookup ? 'Email not found' : 'Tryggd ID not found',
                        `We could not find ${rawInput}.`
                    );
                    return;
                }

                if (userResult.user_id === user.id) {
                    Alert.alert(
                        t('contacts.alerts.selfContact.title'),
                        t('contacts.alerts.selfContact.message')
                    );
                    return;
                }

                const { data: existingContact } = await supabase
                    .from('contacts')
                    .select('*')
                    .eq('owner_user_id', user.id)
                    .eq('contact_user_id', userResult.user_id)
                    .maybeSingle();

                if (existingContact) {
                    Alert.alert(
                        t('contacts.alerts.contactExists.title'),
                        `${userResult.username || usernameToSearch} is already in your contact circle.`
                    );
                    return;
                }

                const { data: existingRequest } = await supabase
                    .from('contact_requests')
                    .select('*')
                    .or(
                        `and(sender_user_id.eq.${user.id},receiver_user_id.eq.${userResult.user_id}),and(sender_user_id.eq.${userResult.user_id},receiver_user_id.eq.${user.id})`
                    )
                    .eq('status', 'pending')
                    .maybeSingle();

                if (existingRequest) {
                    if (existingRequest.sender_user_id === user.id) {
                        Alert.alert(
                            t('contacts.alerts.requestExists.title'),
                            t('contacts.alerts.requestExists.message')
                        );
                    } else {
                        Alert.alert(
                            t('contacts.alerts.requestReceived.title'),
                            `${userResult.username || userResult.email || rawInput} has already sent you a request.`
                        );
                    }
                    return;
                }

                resolved.push({
                    user_id: userResult.user_id,
                    identifier: userResult.username || userResult.email || rawInput,
                    email: userResult.email,
                    display_name: userResult.display_name,
                    username: userResult.username || undefined,
                    avatar_url: userResult.avatar_url || null,
                });
            }

            for (const contact of resolved) {
                await sendContactRequest(contact);
            }

            setNewContacts([]);
        } catch (e: any) {
            Alert.alert(t('errors.title'), e.message || t('contacts.errors.save'));
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
                .from('contact_requests')
                .select('*')
                .eq('id', requestId)
                .eq('receiver_user_id', user.id)
                .eq('status', 'pending')
                .maybeSingle();

            if (totalContactsCount >= capabilities.maxContacts) {
                Alert.alert(
                    t('contacts.alerts.limitReached.title'),
                    t('contacts.alerts.limitReached.message'),
                    [{ text: t('common.ok') }]
                );
                return;
            }

            if (fetchError || !requestData) {
                Alert.alert(t('errors.title'), t('contacts.errors.requestNotFound'));
                setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
                return;
            }

            const { data, error } = await supabase.rpc('accept_contact_request', {
                request_id: requestId,
            });

            if (error) {
                console.error('Database function error:', error);
                throw new Error(t('contacts.errors.accept'));
            }

            if (data?.error) {
                Alert.alert(t('errors.title'), data.error);
                return;
            }

            if (data?.warning) {
                setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
                Alert.alert(
                    t('contacts.alerts.contactExists.title'),
                    t('contacts.alerts.alreadyInContacts')
                );
                return;
            }

            setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
            await fetchAllData();
            setActiveSection('contacts');

            const senderIdentity = await getUserIdentity(requestData.sender_user_id);

            Alert.alert(
                t('contacts.success.contactAdded.title'),
                t('contacts.success.contactAdded.message', {
                    name:
                        senderIdentity.display_name ||
                        requestData.sender_display_name ||
                        requestData.sender_username ||
                        'User',
                })
            );
        } catch (error: any) {
            console.error('Accept request error:', error);
            Alert.alert(
                t('errors.title'),
                error.message || t('contacts.errors.accept')
            );
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            const { data: requestData } = await supabase
                .from('contact_requests')
                .select('*')
                .eq('id', requestId)
                .eq('status', 'pending')
                .maybeSingle();

            if (!requestData) {
                setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
                Alert.alert(
                    t('contacts.alerts.requestHandled.title'),
                    t('contacts.alerts.requestHandled.message')
                );
                return;
            }

            const { error } = await supabase
                .from('contact_requests')
                .update({
                    status: 'rejected',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', requestId);

            if (error) throw error;

            setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));
            Alert.alert(
                t('contacts.success.requestRejected.title'),
                t('contacts.success.requestRejected.message')
            );
        } catch (error: any) {
            console.error('Reject request error:', error);
            setIncomingRequests((prev) => prev.filter((req) => req.id !== requestId));

            if (error.code === '23505') {
                Alert.alert(
                    t('contacts.alerts.requestHandled.title'),
                    t('contacts.alerts.requestHandled.message')
                );
            } else {
                Alert.alert(t('errors.title'), t('contacts.errors.reject'));
            }
        }
    };

    const handleCancelRequest = async (requestId: string) => {
        try {
            const { error } = await supabase
                .from('contact_requests')
                .delete()
                .eq('id', requestId);

            if (error) throw error;

            setOutgoingRequests((prev) => prev.filter((req) => req.id !== requestId));
            Alert.alert(
                t('contacts.success.requestCancelled.title'),
                t('contacts.success.requestCancelled.message')
            );
        } catch (error) {
            console.error('Cancel request error:', error);
            Alert.alert(t('errors.title'), t('contacts.errors.cancel'));
        }
    };

    const cleanupContactData = async () => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) return;

            const { data: acceptedRequests } = await supabase
                .from('contact_requests')
                .select('*')
                .or(`sender_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
                .eq('status', 'accepted');

            if (acceptedRequests && acceptedRequests.length > 0) {
                for (const request of acceptedRequests) {
                    const otherUserId =
                        request.sender_user_id === user.id
                            ? request.receiver_user_id
                            : request.sender_user_id;

                    const { data: contact } = await supabase
                        .from('contacts')
                        .select('*')
                        .eq('owner_user_id', user.id)
                        .eq('contact_user_id', otherUserId)
                        .maybeSingle();

                    if (!contact) {
                        await supabase
                            .from('contact_requests')
                            .delete()
                            .eq('id', request.id);
                    }
                }
            }

            const { data: allContacts } = await supabase
                .from('contacts')
                .select('*')
                .eq('owner_user_id', user.id);

            if (allContacts && allContacts.length > 0) {
                for (const contact of allContacts) {
                    const { data: acceptedRequest } = await supabase
                        .from('contact_requests')
                        .select('*')
                        .or(
                            `and(sender_user_id.eq.${user.id},receiver_user_id.eq.${contact.contact_user_id}),and(sender_user_id.eq.${contact.contact_user_id},receiver_user_id.eq.${user.id})`
                        )
                        .eq('status', 'accepted')
                        .maybeSingle();

                    const { data: claimedInvite } = await supabase
                        .from('contact_invites')
                        .select('id')
                        .eq('invite_kind', 'signup')
                        .eq('status', 'claimed')
                        .or(
                            `and(inviter_user_id.eq.${user.id},claimed_by_user_id.eq.${contact.contact_user_id}),and(inviter_user_id.eq.${contact.contact_user_id},claimed_by_user_id.eq.${user.id})`
                        )
                        .maybeSingle();

                    if (!acceptedRequest && !claimedInvite) {
                        await supabase
                            .from('contacts')
                            .delete()
                            .eq('id', contact.id);
                    }
                }
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    };


    const allContacts = [...existingContacts, ...newContacts];

    // Loading states
    if (isInitialLoading) {
        return (
            <SafeAreaView style={styles.mainContainer} edges={['top']}>
                <ScreenHeader
                    title={t('contacts.title')}
                    subtitle={t('contacts.loading')}
                    iconName="people"
                />
                <View style={styles.initialLoadingContainer}>
                    <ActivityIndicator size="large" color={BaseColors.primary} />
                    <Text style={styles.initialLoadingText}>
                        {t('common.loading')}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }


    return (
        <SafeAreaView style={styles.mainContainer} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={getKeyboardVerticalOffset()}
            >
                {/* Screen Header */}
                <ScreenHeader
                    title={t('contacts.title')}
                    subtitle={
                        totalContactsCount > 0
                            ? capabilities.maxContacts >= 999
                                ? t('contacts.subtitle.withContactsUnlimited', {
                                    count: totalContactsCount,
                                })
                                : t('contacts.subtitle.withContacts', {
                                    count: totalContactsCount,
                                    max: capabilities.maxContacts,
                                })
                            : t('contacts.subtitle.noContacts')
                    }
                    iconName="people"
                    rightElement={
                        <View style={styles.headerActions}>
                            <TouchableOpacity
                                onPress={() => setInviteModalVisible(true)}
                                style={styles.inviteButton}
                            >
                                <Ionicons
                                    name="link"
                                    size={ICON_SIZES.MD}
                                    color={BaseColors.primary}
                                />
                            </TouchableOpacity>
                            {/* <TouchableOpacity
                                onPress={handleManualRefresh}
                                style={styles.refreshButton}
                                disabled={isRefreshing}
                            >
                                <Ionicons
                                    name="refresh"
                                    size={ICON_SIZES.MD}
                                    color={isRefreshing ? BaseColors.neutral[300] : BaseColors.primary}
                                    style={isRefreshing ? styles.refreshing : undefined}
                                />
                            </TouchableOpacity> */}
                            <TouchableOpacity
                                onPress={handleAddNewContact}
                                style={styles.addButton}
                                disabled={totalContactsCount >= capabilities.maxContacts}
                            >
                                <Ionicons
                                    name="add-circle"
                                    size={ICON_SIZES.LG}
                                    color={
                                        totalContactsCount >= capabilities.maxContacts
                                            ? BaseColors.neutral[300]
                                            : BaseColors.primary
                                    }
                                />
                            </TouchableOpacity>
                        </View>
                    }
                />

                {/* Tabs */}
                <View style={styles.tabsContainer}>
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tab, activeSection === 'contacts' && styles.activeTab]}
                            onPress={() => setActiveSection('contacts')}
                        >
                            <Ionicons
                                name="people"
                                size={ICON_SIZES.SM}
                                color={
                                    activeSection === 'contacts'
                                        ? BaseColors.primary
                                        : BaseColors.neutral[400]
                                }
                            />
                            <Text
                                style={[
                                    styles.tabText,
                                    activeSection === 'contacts' && styles.activeTabText,
                                ]}
                                allowFontScaling={false}
                            >
                                {t('contacts.tabs.contacts')}{' '}
                                {totalContactsCount > 0 && `(${totalContactsCount})`}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.tab, activeSection === 'requests' && styles.activeTab]}
                            onPress={() => {
                                setActiveSection('requests');
                                resetUnread();
                            }}
                        >
                            <View style={styles.tabIconContainer}>
                                <Ionicons
                                    name="mail"
                                    size={ICON_SIZES.SM}
                                    color={
                                        activeSection === 'requests'
                                            ? BaseColors.primary
                                            : BaseColors.neutral[400]
                                    }
                                />
                                {unreadCount > 0 && activeSection !== 'requests' && (
                                    <View style={styles.unreadBadge} />
                                )}
                            </View>
                            <Text
                                style={[
                                    styles.tabText,
                                    activeSection === 'requests' && styles.activeTabText,
                                ]}
                                allowFontScaling={false}
                            >
                                {t('contacts.tabs.requests')}{' '}
                                {totalRequestsCount > 0 && `(${totalRequestsCount})`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* CONTACTS SECTION */}
                {activeSection === 'contacts' ? (
                    <>
                        <ScrollView
                            ref={scrollViewRef}
                            showsVerticalScrollIndicator={false}
                            style={styles.scrollView}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContent}
                            refreshControl={
                                <RefreshControl
                                    refreshing={isRefreshing}
                                    onRefresh={handleManualRefresh}
                                    colors={[BaseColors.primary]}
                                    tintColor={BaseColors.primary}
                                    title={t('common.refreshing')}
                                    titleColor={BaseColors.neutral[500]}
                                />
                            }
                        >
                            {allContacts.length === 0 && !isRefreshing ? (
                                <View style={styles.emptyState}>
                                    <Ionicons
                                        name="people-outline"
                                        size={64}
                                        color={BaseColors.neutral[300]}
                                    />
                                    <Text style={styles.emptyStateTitle} allowFontScaling={false}>
                                        {t('contacts.emptyState.title')}
                                    </Text>
                                    <Text style={styles.emptyStateText} allowFontScaling={false}>
                                        {t('contacts.emptyState.message')}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    {/* Show existing contacts first */}
                                    {existingContacts.map((contact, index) => (
                                        <ContactCard
                                            key={`existing-${contact.id}`}
                                            contact={contact}
                                            index={index}
                                            isActive={activeInputIndex === index}
                                            onIdentifierChange={() => { }} // No editing for existing contacts
                                            onFocus={() => handleInputFocus(index)}
                                            onBlur={() => handleInputBlur(index)}
                                            onRemove={() => removeExistingContact(index)}
                                            onToggleCheckinNotifications={(value) =>
                                                toggleContactCheckinNotifications(index, value)
                                            }
                                            onToggleLocationSharing={(value) =>
                                                toggleContactLocationSharing(index, value)
                                            }
                                            onCreateRecoveryInvite={() => handleCreateRecoveryInvite(contact)}
                                            showCheckinNotificationControl={
                                                capabilities.canControlCheckinRecipients
                                            }
                                            showLocationSharingControl={
                                                capabilities.canShareLocation
                                            }
                                            inputRef={(ref) => (inputRefs.current[index] = ref)}
                                            isNewContact={false}
                                        />
                                    ))}

                                    {/* Show new contacts (being added) */}
                                    {newContacts.map((contact, newIndex) => {
                                        const actualIndex = existingContacts.length + newIndex;
                                        return (
                                            <ContactCard
                                                key={`new-${newIndex}`}
                                                contact={contact}
                                                index={actualIndex}
                                                isActive={activeInputIndex === actualIndex}
                                                onIdentifierChange={(text) =>
                                                    updateNewContact(newIndex, text)
                                                }
                                                onFocus={() => handleInputFocus(actualIndex)}
                                                onBlur={() => handleInputBlur(actualIndex)}
                                                onRemove={() => removeNewContact(newIndex)}
                                                showCheckinNotificationControl={false}
                                                showLocationSharingControl={false}
                                                inputRef={(ref) => (inputRefs.current[actualIndex] = ref)}
                                                isNewContact={true}
                                            />
                                        );
                                    })}
                                </>
                            )}

                            {/* Add bottom padding for save button */}
                            {newContacts.length === 0 && <View style={styles.scrollBottomPadding} />}
                        </ScrollView>

                        {/* Save Button - FIXED at bottom when new contacts exist */}
                        {newContacts.length > 0 && (
                            <View style={styles.footer}>
                                <TouchableOpacity
                                    disabled={saving}
                                    onPress={saveNewContacts}
                                    activeOpacity={0.8}
                                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                                >
                                    <View style={styles.buttonContent}>
                                        {saving ? (
                                            <Ionicons
                                                name="refresh"
                                                size={18}
                                                color="#fff"
                                                style={[styles.buttonIcon, styles.spinning]}
                                            />
                                        ) : (
                                            <Ionicons
                                                name="send"
                                                size={18}
                                                color="#fff"
                                                style={styles.buttonIcon}
                                            />
                                        )}
                                        <Text style={styles.buttonText} allowFontScaling={false}>
                                            {saving
                                                ? t('contacts.buttons.sending')
                                                : t('contacts.buttons.sendRequests', {
                                                    count: newContacts.length,
                                                })}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                ) : (
                    /* REQUESTS SECTION */
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.requestsContent}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleManualRefresh}
                                colors={[BaseColors.primary]}
                                tintColor={BaseColors.primary}
                                title={t('common.refreshing')}
                                titleColor={BaseColors.neutral[500]}
                            />
                        }
                    >
                        {totalRequestsCount === 0 && !isRefreshing ? (
                            <View style={styles.emptyState}>
                                <Ionicons
                                    name="mail-open-outline"
                                    size={64}
                                    color={BaseColors.neutral[300]}
                                />
                                <Text style={styles.emptyStateTitle} allowFontScaling={false}>
                                    {t('contacts.requests.emptyState.title')}
                                </Text>
                                <Text style={styles.emptyStateText} allowFontScaling={false}>
                                    {t('contacts.requests.emptyState.message')}
                                </Text>
                            </View>
                        ) : (
                            <>
                                {incomingRequests.length > 0 && (
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle} allowFontScaling={false}>
                                            {t('contacts.requests.received')}
                                        </Text>
                                        {incomingRequests.map((request) => (
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
                                        <Text style={styles.sectionTitle} allowFontScaling={false}>
                                            {t('contacts.requests.sent')}
                                        </Text>
                                        {outgoingRequests.map((request) => (
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

                <Modal
                    visible={inviteModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setInviteModalVisible(false)}
                >
                    <KeyboardAvoidingView
                        style={styles.modalBackdrop}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle} allowFontScaling={false}>
                                {t('contacts.invite.modalTitle')}
                            </Text>
                            <Text style={styles.modalText} allowFontScaling={false}>
                                {t('contacts.invite.modalDescription')}
                            </Text>
                            <TextInput
                                placeholder={t('contacts.placeholders.suggestedUsername')}
                                placeholderTextColor={BaseColors.placeholderTextColor}
                                value={suggestedInviteUsername}
                                onChangeText={(value) => setSuggestedInviteUsername(normalizeUsername(value))}
                                autoCapitalize="none"
                                autoCorrect={false}
                                returnKeyType="done"
                                onSubmitEditing={Keyboard.dismiss}
                                style={styles.modalInput}
                                allowFontScaling={false}
                            />
                            <Text style={styles.modalSubtleText} allowFontScaling={false}>
                                {suggestedInviteValidationMessage || t('contacts.invite.suggestedUsernameHelp')}
                            </Text>
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.modalSecondaryButton}
                                    onPress={() => setInviteModalVisible(false)}
                                    disabled={creatingInvite}
                                >
                                    <Text style={styles.modalSecondaryButtonText} allowFontScaling={false}>
                                        {t('common.cancel')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalPrimaryButton, (creatingInvite || !!suggestedInviteValidationMessage) && styles.saveButtonDisabled]}
                                    onPress={() => {
                                        Keyboard.dismiss();
                                        void handleCreateInvite();
                                    }}
                                    disabled={creatingInvite || !!suggestedInviteValidationMessage}
                                >
                                    <Text style={styles.modalPrimaryButtonText} allowFontScaling={false}>
                                        {creatingInvite ? t('contacts.invite.creating') : t('contacts.invite.createButton')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                <Modal
                    visible={inviteShareVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setInviteShareVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <View style={styles.modalCard}>
                            <Text style={styles.modalTitle} allowFontScaling={false}>
                                {generatedInvite?.invite_kind === 'recovery'
                                    ? t('contacts.invite.recoveryReady')
                                    : t('contacts.invite.ready')}
                            </Text>
                            <Text style={styles.modalText} allowFontScaling={false}>
                                {generatedInvite?.invite_kind === 'recovery'
                                    ? t('contacts.invite.recoveryInstructions')
                                    : t('contacts.invite.instructions')}
                            </Text>
                            <Text style={styles.generatedInviteCode} allowFontScaling={false}>
                                {generatedInvite?.invite_code || '------'}
                            </Text>
                            <Text style={styles.modalSubtleText} allowFontScaling={false}>
                                {t('contacts.invite.expiresOn', {
                                    date: generatedInvite?.expires_at ? new Date(generatedInvite.expires_at).toLocaleDateString() : '—',
                                })}
                            </Text>
                            {generatedInvite?.invite_kind === 'recovery' && generatedInvite?.target_username ? (
                                <Text style={styles.modalSubtleText} allowFontScaling={false}>
                                    {t('contacts.invite.resettingTryggdId', {
                                        id: generatedInvite.target_username,
                                    })}
                                </Text>
                            ) : generatedInvite?.suggested_username ? (
                                <Text style={styles.modalSubtleText} allowFontScaling={false}>
                                    {t('contacts.invite.suggestedTryggdId', {
                                        id: generatedInvite.suggested_username,
                                    })}
                                </Text>
                            ) : null}
                            <View style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.modalSecondaryButton}
                                    onPress={() => {
                                        setInviteShareVisible(false);
                                        setGeneratedInvite(null);
                                    }}
                                >
                                    <Text style={styles.modalSecondaryButtonText} allowFontScaling={false}>
                                        {t('common.done')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.modalPrimaryButton}
                                    onPress={handleShareInviteLink}
                                >
                                    <Text style={styles.modalPrimaryButtonText} allowFontScaling={false}>
                                        {t('contacts.invite.shareButton')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: BaseColors.background,
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    tabsContainer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 6,
        backgroundColor: BaseColors.background,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: BaseColors.neutral[100],
        borderRadius: 14,
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 9,
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: BaseColors.surface,
        shadowColor: BaseColors.shadowColor,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tabText: {
        fontSize: iosFontSize(14),
        fontWeight: '600',
        color: BaseColors.text.light,
        marginLeft: 6,
    },
    activeTabText: {
        color: BaseColors.text.dark,
    },
    tabIconContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    unreadBadge: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: BaseColors.highlight,
        marginLeft: 4,
        marginTop: -8,
    },
    addButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.primaryLight,
        borderWidth: 1,
        borderColor: BaseColors.primaryBorder,
    },
    inviteButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.neutral[50],
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    scrollBottomPadding: {
        height: 20,
    },
    requestsContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 32,
    },
    loadingIcon: {
        marginBottom: 10,
    },
    loadingText: {
        fontSize: iosFontSize(14),
        color: BaseColors.text.light,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 20,
    },
    emptyStateTitle: {
        fontSize: iosFontSize(20),
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginTop: 16,
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: iosFontSize(14),
        color: BaseColors.text.light,
        textAlign: 'center',
        lineHeight: 20,
    },
    card: {
        backgroundColor: BaseColors.surface,
        borderRadius: 18,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: BaseColors.neutral[100],
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
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
        backgroundColor: BaseColors.surface,
        borderColor: BaseColors.primary,
    },
    existingContactCardWrapper: {
        padding: 0,
        borderWidth: 1,
        borderColor: BaseColors.neutral[100],
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        marginBottom: 10,
    },
    cardTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1, // Allow title to take available space
    },
    cardNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: BaseColors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    cardNumberText: {
        color: BaseColors.surface,
        fontWeight: '600',
        fontSize: iosFontSize(12),
    },
    cardTitleText: {
        fontSize: iosFontSize(16),
        fontWeight: '600',
        color: BaseColors.text.dark,
        flex: 1, // Allow text to take available space
    },
    removeButton: {
        padding: 4,
        marginLeft: 8, // Add space between title and remove button
    },
    input: {
        backgroundColor: BaseColors.surface,
        borderRadius: 12,
        padding: 12,
        fontSize: iosFontSize(15),
        color: BaseColors.text.dark,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        minHeight: 44,
    },
    displayNameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        padding: 10,
        backgroundColor: BaseColors.primaryLight,
        borderRadius: 10,
    },
    displayNameText: {
        marginLeft: 6,
        fontSize: iosFontSize(13),
        color: BaseColors.primaryDark,
        fontWeight: '500',
        flex: 1, // Allow text to wrap
    },
    existingContactInfo: {
        backgroundColor: BaseColors.neutral[50],
        borderRadius: 14,
        paddingVertical: 10,
        paddingLeft: 10,
        paddingRight: 8,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
    },
    existingContactCard: {
        backgroundColor: BaseColors.surface,
        borderRadius: 15,
        padding: 14,
    },
    existingContactHeading: {
        marginBottom: 14,
    },
    existingContactTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
    },
    existingContactMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    contactAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: BaseColors.neutral[100],
    },
    contactAvatarFallback: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: BaseColors.primaryLight,
        borderWidth: 1,
        borderColor: BaseColors.primaryBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    existingContactText: {
        marginLeft: 10,
        fontSize: iosFontSize(15),
        color: BaseColors.text.dark,
        flex: 1, // This prevents icon spillover
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 20 : 16,
        backgroundColor: BaseColors.surface,
        borderTopWidth: 1,
        borderTopColor: BaseColors.neutral[100],
    },
    saveButton: {
        backgroundColor: BaseColors.primary,
        padding: 16,
        borderRadius: 14,
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.primary,
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
        backgroundColor: BaseColors.neutral[400],
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonIcon: {
        marginRight: 6,
    },
    buttonText: {
        color: BaseColors.surface,
        fontSize: iosFontSize(16),
        fontWeight: '600',
    },
    requestCard: {
        backgroundColor: BaseColors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: BaseColors.neutral[100],
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
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
        marginRight: 8, // Add space between info and time
    },
    requestTextContainer: {
        marginLeft: 12,
        flex: 1,
    },
    requestName: {
        fontSize: iosFontSize(16),
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginBottom: 2,
    },
    requestEmail: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[500],
    },
    requestTime: {
        fontSize: iosFontSize(12),
        color: BaseColors.neutral[400],
    },
    requestMessage: {
        backgroundColor: BaseColors.neutral[50],
        padding: 12,
        borderRadius: 10,
        marginBottom: 12,
        borderLeftWidth: 3,
        borderLeftColor: BaseColors.primary,
    },
    requestMessageText: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[600],
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
        backgroundColor: BaseColors.primary,
    },
    rejectButton: {
        backgroundColor: BaseColors.neutral[100],
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
    },
    acceptButtonText: {
        color: BaseColors.surface,
        fontWeight: '600',
        fontSize: iosFontSize(14),
        marginLeft: 6,
    },
    rejectButtonText: {
        color: BaseColors.neutral[600],
        fontWeight: '600',
        fontSize: iosFontSize(14),
        marginLeft: 6,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        borderRadius: 8,
    },
    cancelButtonText: {
        color: BaseColors.neutral[400],
        fontWeight: '600',
        fontSize: iosFontSize(14),
        marginLeft: 6,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: iosFontSize(18),
        fontWeight: '700',
        color: BaseColors.text.dark,
        marginBottom: 12,
    },
    displayNameMain: {
        marginLeft: 10,
        fontSize: iosFontSize(18),
        fontWeight: '600',
        color: BaseColors.text.dark,
        lineHeight: iosFontSize(22),
        flex: 1,
    },
    emailSubdued: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[500],
        marginTop: 8,
        marginLeft: 40,
    },
    contactIdInline: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[500],
        marginLeft: 12,
        flexShrink: 1,
        textAlign: 'right',
    },
    cardHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginLeft: 'auto',
    },
    headerActionButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.neutral[50],
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
    },
    locationToggleEnabled: {
        backgroundColor: BaseColors.primaryLight,
        borderWidth: 1,
        borderColor: BaseColors.primaryBorder,
    },
    locationToggleDisabled: {
        backgroundColor: BaseColors.errorLight,
        borderWidth: 1,
        borderColor: BaseColors.errorBorder,
    },
    locationToggleSlash: {
        position: 'absolute',
        width: 22,
        height: 1.75,
        backgroundColor: BaseColors.error,
        transform: [{ rotate: '45deg' }],
        borderRadius: 1,
    },
    notificationToggleDisabled: {
        backgroundColor: BaseColors.errorLight,
        borderWidth: 1,
        borderColor: BaseColors.errorBorder,
    },
    notificationToggleSlash: {
        position: 'absolute',
        width: 22,
        height: 1.75,
        backgroundColor: BaseColors.error,
        transform: [{ rotate: '45deg' }],
        borderRadius: 1,
    },
    initialLoadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BaseColors.background,
    },
    initialLoadingText: {
        marginTop: 12,
        fontSize: iosFontSize(16),
        color: BaseColors.neutral[500],
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    refreshButton: {
        padding: 4,
    },
    refreshing: {
        transform: [{ rotate: '45deg' }],
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(17, 24, 39, 0.45)',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    modalCard: {
        backgroundColor: BaseColors.surface,
        borderRadius: 18,
        padding: 20,
    },
    modalTitle: {
        fontSize: iosFontSize(20),
        fontWeight: '700',
        color: BaseColors.text.dark,
        marginBottom: 8,
    },
    modalText: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[600],
        lineHeight: 20,
        marginBottom: 16,
    },
    modalInput: {
        backgroundColor: BaseColors.surface,
        borderRadius: 12,
        padding: 12,
        fontSize: iosFontSize(15),
        color: BaseColors.text.dark,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        minHeight: 44,
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
    },
    modalSecondaryButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: BaseColors.neutral[100],
    },
    modalSecondaryButtonText: {
        fontSize: iosFontSize(14),
        fontWeight: '600',
        color: BaseColors.neutral[700],
    },
    modalPrimaryButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: BaseColors.primary,
    },
    modalPrimaryButtonText: {
        fontSize: iosFontSize(14),
        fontWeight: '600',
        color: BaseColors.surface,
    },
    generatedInviteCode: {
        fontSize: iosFontSize(34),
        fontWeight: '700',
        letterSpacing: 4,
        textAlign: 'center',
        color: BaseColors.primaryDark,
        marginBottom: 12,
    },
    modalSubtleText: {
        fontSize: iosFontSize(13),
        color: BaseColors.neutral[500],
        marginBottom: 16,
    },
});
