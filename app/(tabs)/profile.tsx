// screens/ProfileScreen.tsx
import HeaderWithBack from '@/components/common/HeaderWithBack';
import { BaseColors } from '@/constants/colors';
import { clearPushTokens } from '@/lib/notifications/core';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Alert,
    AppState,
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ActivityIndicator,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deriveDisplayName, isAppleRelayEmail as isAppleRelayEmailAddress } from '../../lib/profile/displayName';
import { isLocalAvatarUri, uploadAvatarToStorage } from '../../lib/profile/avatarStorage';
import { supabase } from '../../lib/supabase';
import { iosFontSize } from '@/constants/typography';
import { isSyntheticAuthEmail } from '@/lib/auth/phoneIdentity';
import { useAuth } from '@/contexts/AuthContext';

type UserProfile = {
    id: string;
    display_name: string;
    username?: string | null;
    email?: string;
    auth_provider?: string;
    phone?: string;
    avatar_url?: string;
    avatar_mime_type?: string | null;
    avatar_base64?: string | null;
};


export default function ProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { refreshProfile } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [qrToken, setQrToken] = useState<string | null>(null);
    const [generatingQr, setGeneratingQr] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
    const isMountedRef = useRef(true);

    const [profile, setProfile] = useState<UserProfile>({
        id: '',
        display_name: '',
        username: '',
        email: '',
        auth_provider: '',
        phone: '',
        avatar_url: '',
        avatar_mime_type: null,
        avatar_base64: null,
    });

    const isAppleRelayEmail = isAppleRelayEmailAddress(profile.email);
    const isInvitedAccount = isSyntheticAuthEmail(profile.email);
    const displayAvatarUrl = profile.avatar_url?.trim() || '';
    const providerLabel =
        isInvitedAccount
            ? 'Tryggd ID and password'
            : profile.auth_provider === 'apple'
            ? 'Apple'
            : profile.auth_provider === 'google'
                ? 'Google'
                : 'Email';

    useEffect(() => {
        setAvatarLoadFailed(false);
    }, [displayAvatarUrl]);

    // ✅ 1. Define loadProfile with useCallback
    const loadProfile = useCallback(async () => {
        if (!isMountedRef.current) return;

        try {
            setLoading(true);

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                router.replace('/(auth)/login');
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) {
                console.error('Error fetching profile:', error);
                await createProfile(user);
                return;
            }

            if (data && isMountedRef.current) {
                setProfile({
                    id: data.id,
                    display_name: data.display_name || '',
                    username: data.username || '',
                    email: user.email || '',
                    auth_provider: user.app_metadata?.provider || 'email',
                    phone: data.phone || '',
                    avatar_url: data.avatar_url || '',
                    avatar_mime_type: null,
                    avatar_base64: null,
                });

                await AsyncStorage.setItem(
                    '@user_profile',
                    JSON.stringify({
                        display_name: data.display_name || '',
                        username: data.username || '',
                        email: user.email || '',
                        auth_provider: user.app_metadata?.provider || 'email',
                        phone: data.phone || '',
                        avatar_url: data.avatar_url || '',
                        avatar_mime_type: null,
                        avatar_base64: null,
                    })
                );
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            Alert.alert(t('errors.title'), t('profile.errors.loadProfile'));
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [router, t]);

    // ✅ 2. Initial fetch
    useEffect(() => {
        isMountedRef.current = true;
        loadProfile();

        return () => {
            isMountedRef.current = false;
        };
    }, [loadProfile]);

    // ✅ 3. FOCUS EFFECT - triggers when switching to this tab
    useFocusEffect(
        useCallback(() => {
            if (isEditing || saving) return;
            console.log('🎯 Profile screen focused - fetching fresh profile data');
            loadProfile();
        }, [isEditing, loadProfile, saving])
    );

    // ✅ 4. APP STATE EFFECT - triggers on lock/unlock and background/foreground
    useEffect(() => {
        let isActive = true;

        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === 'active' && isActive) {
                if (isEditing || saving) return;
                console.log('📱 App became active - refreshing profile data');
                loadProfile();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            isActive = false;
            subscription.remove();
        };
    }, [isEditing, loadProfile, saving]);

    // ✅ 5. Keep createProfile as is
    const createProfile = async (user: any) => {
        try {
            const { error } = await supabase.from('profiles').insert({
                id: user.id,
                display_name: deriveDisplayName(user, t('profile.defaultName')),
                avatar_url: '',
                avatar_mime_type: null,
                avatar_base64: null,
            });

            if (error) {
                console.error('Error creating profile:', error);
                return;
            }

            loadProfile();
        } catch (error) {
            console.error('Error creating profile:', error);
        }
    };

    // ✅ 6. Keep saveProfile as is
    const saveProfile = async () => {
        try {
            setSaving(true);

            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                Alert.alert(t('errors.title'), t('profile.errors.notLoggedIn'));
                return;
            }

            let avatarUrl = profile.avatar_url?.trim() || '';
            if (isLocalAvatarUri(avatarUrl)) {
                avatarUrl = await uploadAvatarToStorage(
                    supabase,
                    user.id,
                    avatarUrl,
                    profile.avatar_mime_type,
                    profile.avatar_base64
                );
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: profile.display_name.trim(),
                    phone: profile.phone?.trim() || '',
                    avatar_url: avatarUrl,
                })
                .eq('id', user.id);

            if (error) {
                console.error('Error updating profile:', error);
                Alert.alert(t('errors.title'), t('profile.errors.updateProfile'));
                return;
            }

            await AsyncStorage.setItem(
                '@user_profile',
                JSON.stringify({
                    display_name: profile.display_name,
                    username: profile.username,
                    email: profile.email,
                    auth_provider: profile.auth_provider,
                    phone: profile.phone,
                    avatar_url: avatarUrl,
                    avatar_mime_type: null,
                    avatar_base64: null,
                })
            );

            setProfile((current) => ({
                ...current,
                avatar_url: avatarUrl,
                avatar_mime_type: null,
                avatar_base64: null,
            }));
            await refreshProfile();

            setIsEditing(false);
            Alert.alert(t('profile.success.title'), t('profile.success.saved'));
        } catch (error) {
            console.error('Error saving profile:', error);
            Alert.alert(t('errors.title'), t('profile.errors.saveProfile'));
        } finally {
            setSaving(false);
        }
    };

    // ✅ 7. Update cancelEdit to use loadProfile
    const cancelEdit = () => {
        setIsEditing(false);
        loadProfile(); // Reload original data
    };

    // Keep all other functions exactly as they are:
    // - pickAvatar
    // - takePhoto
    // - handleLogout
    // - renderField

    const pickAvatar = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
                base64: true,
            });

            if (!result.canceled) {
                setProfile((current) => ({
                    ...current,
                    avatar_url: result.assets[0].uri,
                    avatar_mime_type: result.assets[0].mimeType || null,
                    avatar_base64: result.assets[0].base64 || null,
                }));
                setShowAvatarModal(false);
            }
        } catch (error) {
            console.error('Error picking avatar:', error);
        }
    };

    const takePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(t('permissions.title'), t('profile.permissions.camera'));
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
                base64: true,
            });

            if (!result.canceled) {
                setProfile((current) => ({
                    ...current,
                    avatar_url: result.assets[0].uri,
                    avatar_mime_type: result.assets[0].mimeType || null,
                    avatar_base64: result.assets[0].base64 || null,
                }));
                setShowAvatarModal(false);
            }
        } catch (error) {
            console.error('Error taking photo:', error);
        }
    };

    const handleShowQr = async () => {
        setShowQrModal(true);
        setQrToken(null);
        setGeneratingQr(true);
        try {
            const { data, error } = await supabase.rpc('generate_qr_token');
            if (error) throw error;
            setQrToken(data as string);
        } catch {
            Alert.alert(t('errors.title'), t('profile.qr.errorGenerating'));
            setShowQrModal(false);
        } finally {
            setGeneratingQr(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert(t('profile.logout.title'), t('profile.logout.confirm'), [
            {
                text: t('common.cancel'),
                style: 'cancel',
            },
            {
                text: t('profile.logout.button'),
                style: 'destructive',
                onPress: async () => {
                    try {
                        const { data: { user } } = await supabase.auth.getUser();

                        if (user) {
                            await clearPushTokens(user.id);
                        }

                        await clearLocalSessionState();

                        const { error } = await supabase.auth.signOut();
                        if (error) throw error;

                        router.replace('/(auth)/login');
                    } catch (error) {
                        console.error('Error during logout:', error);
                        Alert.alert(t('errors.title'), t('profile.errors.loadProfile'));
                    }
                },
            },
        ]);
    };

    const clearLocalSessionState = async () => {
        await AsyncStorage.multiRemove([
            '@expo_push_token',
            '@user_profile',
            '@app_language',
            '@settings_notifications',
            '@settings_check_in_reminder',
            '@settings_contact_check_in',
        ]);
    };

    const deleteAccount = async () => {
        try {
            setDeleting(true);

            const { data, error } = await supabase.functions.invoke('delete-account');
            if (error) throw error;
            if (!data?.success) throw new Error('Account deletion did not complete');

            await clearLocalSessionState();

            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) {
                console.warn('Sign out after account deletion failed:', signOutError);
            }

            Alert.alert(
                t('profile.deleteAccount.successTitle'),
                t('profile.deleteAccount.successMessage'),
                [{ text: t('common.ok'), onPress: () => router.replace('/(auth)/login') }]
            );
        } catch (error) {
            console.error('Error deleting account:', error);
            Alert.alert(t('errors.title'), t('profile.errors.deleteAccount'));
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('profile.deleteAccount.title'),
            t('profile.deleteAccount.confirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('profile.deleteAccount.button'),
                    style: 'destructive',
                    onPress: () => {
                        Alert.alert(
                            t('profile.deleteAccount.finalTitle'),
                            t('profile.deleteAccount.finalConfirm'),
                            [
                                { text: t('common.cancel'), style: 'cancel' },
                                {
                                    text: t('profile.deleteAccount.button'),
                                    style: 'destructive',
                                    onPress: () => {
                                        void deleteAccount();
                                    },
                                },
                            ]
                        );
                    },
                },
            ]
        );
    };

    const renderField = (
        label: string,
        value: string,
        field: keyof UserProfile,
        editable: boolean = true
    ) => (
        <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{label}</Text>
            {isEditing ? (
                <TextInput
                    value={value}
                    onChangeText={(t) => setProfile({ ...profile, [field]: t })}
                    style={[styles.input, !editable && styles.inputDisabled]}
                    editable={editable}
                    placeholderTextColor={BaseColors.neutral[400]}
                />
            ) : (
                <Text style={styles.fieldValue}>
                    {value || (
                        <Text style={styles.placeholderText}>
                            {t('profile.fields.notSpecified')}
                        </Text>
                    )}
                </Text>
            )}
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <Ionicons
                    name="refresh"
                    size={40}
                    color={BaseColors.neutral[400]}
                    style={styles.loadingIcon}
                />
                <Text style={styles.loadingText}>{t('profile.loading')}</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Screen Header */}
            <HeaderWithBack
                title={t("profile.title")}
                iconName="person"
                onBackPress={() => router.push("/")}
            />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <TouchableOpacity
                        disabled={!isEditing}
                        onPress={() => setShowAvatarModal(true)}
                        style={styles.avatarTouchable}
                        activeOpacity={0.8}
                    >
                        {displayAvatarUrl && !avatarLoadFailed ? (
                            <Image
                                source={{ uri: displayAvatarUrl }}
                                style={styles.avatarImage}
                                onError={() => setAvatarLoadFailed(true)}
                            />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Ionicons
                                    name="person"
                                    size={52}
                                    color={BaseColors.neutral[400]}
                                />
                            </View>
                        )}
                        {isEditing && (
                            <View style={styles.editOverlay}>
                                <Ionicons name="camera" size={24} color="#fff" />
                            </View>
                        )}
                    </TouchableOpacity>
                    {!isEditing ? (
                        <TouchableOpacity
                            onPress={() => setIsEditing(true)}
                            style={styles.editButton}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="create-outline"
                                size={20}
                                color={BaseColors.primary}
                            />
                            <Text style={styles.editButtonText}>
                                {t('profile.buttons.edit')}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.editActions}>
                            <TouchableOpacity
                                onPress={cancelEdit}
                                style={[styles.actionButton, styles.cancelButton]}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.cancelButtonText}>
                                    {t('common.cancel')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveProfile}
                                disabled={saving}
                                style={[
                                    styles.actionButton,
                                    styles.saveButton,
                                    saving && styles.saveButtonDisabled,
                                ]}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="save-outline" size={18} color="#fff" />
                                <Text style={styles.saveButtonText}>
                                    {saving
                                        ? t('profile.buttons.saving')
                                        : t('profile.buttons.save')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Profile Info Card */}
                <View style={styles.infoCard}>
                    {renderField(
                        'Sign-in method',
                        providerLabel,
                        'auth_provider',
                        false
                    )}
                    {profile.username ? (
                        <View style={styles.tryggdIdRow}>
                            <View style={{ flex: 1 }}>
                                {renderField('Tryggd ID', profile.username, 'username', false)}
                            </View>
                            <TouchableOpacity onPress={handleShowQr} style={styles.qrIconButton} activeOpacity={0.7}>
                                <Ionicons name="qr-code-outline" size={28} color={BaseColors.primary} />
                            </TouchableOpacity>
                        </View>
                    ) : renderField('Tryggd ID', '', 'username', false)}
                    {renderField(
                        t('profile.fields.name'),
                        profile.display_name || '',
                        'display_name'
                    )}
                    {!isInvitedAccount && renderField(
                        t('profile.fields.email'),
                        isAppleRelayEmail ? 'Hidden by Apple' : profile.email || '',
                        'email',
                        false
                    )}
                </View>

                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name="log-out-outline"
                        size={20}
                        color={BaseColors.error}
                    />
                    <Text style={styles.logoutText}>
                        {t('profile.buttons.logout')}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.logoutButton, styles.deleteAccountButton, deleting && styles.deleteAccountButtonDisabled]}
                    onPress={handleDeleteAccount}
                    disabled={deleting}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name="trash-outline"
                        size={20}
                        color={BaseColors.error}
                    />
                    <Text style={[styles.logoutText, styles.deleteAccountText]}>
                        {deleting ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.button')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>

            {/* QR Code Modal */}
            <Modal visible={showQrModal} transparent animationType="fade">
                <Pressable style={styles.modalOverlay} onPress={() => setShowQrModal(false)}>
                    <Pressable style={styles.qrModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('profile.qr.title')}</Text>
                            <TouchableOpacity onPress={() => setShowQrModal(false)}>
                                <Ionicons name="close" size={24} color={BaseColors.neutral[500]} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.qrModalBody}>
                            {generatingQr ? (
                                <ActivityIndicator size="large" color={BaseColors.primary} style={{ height: 200 }} />
                            ) : qrToken ? (
                                <>
                                    <View style={styles.qrWrapper}>
                                        <QRCode
                                            value={`tryggd://add?token=${qrToken}`}
                                            size={200}
                                            color={BaseColors.text.dark}
                                            backgroundColor={BaseColors.surface}
                                        />
                                    </View>
                                    <Text style={styles.qrUsername}>@{profile.username}</Text>
                                    <Text style={styles.qrHint}>{t('profile.qr.hint')}</Text>
                                </>
                            ) : null}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Avatar Selection Modal */}
            <Modal visible={showAvatarModal} transparent animationType="fade">
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowAvatarModal(false)}
                >
                    <Pressable style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {t('profile.avatarModal.title')}
                            </Text>
                            <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={BaseColors.neutral[500]}
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={pickAvatar}
                            style={styles.modalOption}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="images-outline"
                                size={24}
                                color={BaseColors.primary}
                            />
                            <Text style={styles.modalOptionText}>
                                {t('profile.avatarModal.chooseFromLibrary')}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={takePhoto}
                            style={styles.modalOption}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="camera-outline"
                                size={24}
                                color={BaseColors.primary}
                            />
                            <Text style={styles.modalOptionText}>
                                {t('profile.avatarModal.takePhoto')}
                            </Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

// ... (keep all your styles exactly as they are)
// ==================== STYLES ====================
const GAP = 16;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7F3EA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F7F3EA',
    },
    loadingIcon: {
        marginBottom: 12,
    },
    loadingText: {
        fontSize: iosFontSize(16),
        color: BaseColors.neutral[500],
    },
    scrollContent: {
        paddingBottom: Platform.OS === 'android' ? 132 : 48,
    },
    avatarSection: {
        alignItems: 'center',
        marginTop: 2,
        marginBottom: GAP,
        paddingHorizontal: 20,
    },
    avatarTouchable: {
        position: 'relative',
        marginBottom: 16,
    },
    avatarImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
        borderColor: BaseColors.primary,
    },
    avatarPlaceholder: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: BaseColors.neutral[100],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: BaseColors.neutral[200],
    },
    editOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: BaseColors.primaryLight,
        borderRadius: 12,
    },
    editButtonText: {
        marginLeft: 6,
        color: BaseColors.primary,
        fontWeight: '600',
        fontSize: iosFontSize(14),
    },
    editActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
    },
    cancelButton: {
        backgroundColor: BaseColors.neutral[100],
    },
    cancelButtonText: {
        color: BaseColors.neutral[600],
        fontWeight: '600',
        fontSize: iosFontSize(14),
    },
    saveButton: {
        backgroundColor: BaseColors.primary,
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
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
    saveButtonText: {
        marginLeft: 6,
        color: BaseColors.surface,
        fontWeight: '600',
        fontSize: iosFontSize(14),
    },
    infoCard: {
        backgroundColor: BaseColors.surface,
        borderRadius: 20,
        paddingTop: 18,
        paddingHorizontal: 20,
        paddingBottom: 10,
        marginHorizontal: 20,
        marginBottom: GAP,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    fieldContainer: {
        marginBottom: 8,
    },
    fieldLabel: {
        fontSize: iosFontSize(14),
        color: BaseColors.text.dark,
        marginBottom: 4,
        fontWeight: '500',
    },
    fieldValue: {
        fontSize: iosFontSize(16),
        fontWeight: '500',
        color: BaseColors.text.light,
        marginLeft: 10,
    },
    placeholderText: {
        color: BaseColors.neutral[400],
        fontStyle: 'italic',
    },
    input: {
        backgroundColor: BaseColors.surface,
        borderRadius: 12,
        padding: 14,
        fontSize: iosFontSize(16),
        color: BaseColors.text.dark,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
    },
    inputDisabled: {
        backgroundColor: BaseColors.neutral[50],
        color: BaseColors.neutral[500],
    },
    settingsCard: {
        backgroundColor: BaseColors.surface,
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginBottom: GAP,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    settingsContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingsIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: BaseColors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    settingsTextContainer: {
        flex: 1,
    },
    settingsTitle: {
        fontSize: iosFontSize(16),
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginBottom: 2,
    },
    settingsSubtitle: {
        fontSize: iosFontSize(14),
        color: BaseColors.neutral[500],
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.surface,
        borderRadius: 16,
        padding: 18,
        marginHorizontal: 20,
        marginBottom: GAP,
        borderWidth: 1,
        borderColor: BaseColors.neutral[300],
        gap: 10,
    },
    logoutText: {
        fontSize: iosFontSize(16),
        fontWeight: '600',
        color: BaseColors.text.dark,
    },
    deleteAccountButton: {
        backgroundColor: BaseColors.errorLight,
        borderColor: BaseColors.errorBorder,
    },
    deleteAccountText: {
        color: BaseColors.error,
    },
    deleteAccountButtonDisabled: {
        opacity: 0.6,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: BaseColors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: BaseColors.neutral[200],
    },
    modalTitle: {
        fontSize: iosFontSize(18),
        fontWeight: '600',
        color: BaseColors.text.dark,
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 18,
        gap: 16,
    },
    modalOptionText: {
        fontSize: iosFontSize(16),
        color: BaseColors.text.dark,
    },
    tryggdIdRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    qrIconButton: {
        padding: 8,
        marginLeft: 4,
    },
    qrModalContent: {
        backgroundColor: BaseColors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    qrModalBody: {
        alignItems: 'center',
        paddingVertical: 24,
        paddingHorizontal: 20,
    },
    qrWrapper: {
        padding: 16,
        backgroundColor: BaseColors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BaseColors.neutral[200],
        marginBottom: 16,
    },
    qrUsername: {
        fontSize: iosFontSize(18),
        fontWeight: '700',
        color: BaseColors.text.dark,
        marginBottom: 8,
    },
    qrHint: {
        fontSize: iosFontSize(13),
        color: BaseColors.neutral[400],
        textAlign: 'center',
    },
});
