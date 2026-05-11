// screens/ProfileScreen.tsx
import HeaderWithBack from '@/components/common/HeaderWithBack';
import { BaseColors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Alert,
    AppState,
    Dimensions,
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deriveDisplayName, isAppleRelayEmail as isAppleRelayEmailAddress } from '../../lib/profile/displayName';
import { supabase } from '../../lib/supabase';

type UserProfile = {
    id: string;
    display_name: string;
    username?: string | null;
    email?: string;
    auth_provider?: string;
    phone?: string;
    avatar_url?: string;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isMountedRef = useRef(true);

    const [profile, setProfile] = useState<UserProfile>({
        id: '',
        display_name: '',
        username: '',
        email: '',
        auth_provider: '',
        phone: '',
        avatar_url: '',
    });

    const isAppleRelayEmail = isAppleRelayEmailAddress(profile.email);
    const providerLabel =
        profile.auth_provider === 'apple'
            ? 'Apple'
            : profile.auth_provider === 'google'
                ? 'Google'
                : 'Email';

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
                });

                await AsyncStorage.setItem(
                    '@user_profile',
                    JSON.stringify({
                        display_name: data.display_name || '',
                        username: data.username || '',
                        email: user.email || '',
                        auth_provider: user.app_metadata?.provider || 'email',
                        phone: data.phone || '',
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
            console.log('🎯 Profile screen focused - fetching fresh profile data');
            loadProfile();
        }, [loadProfile])
    );

    // ✅ 4. APP STATE EFFECT - triggers on lock/unlock and background/foreground
    useEffect(() => {
        let isActive = true;

        const handleAppStateChange = (nextAppState: string) => {
            if (nextAppState === 'active' && isActive) {
                console.log('📱 App became active - refreshing profile data');
                loadProfile();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            isActive = false;
            subscription.remove();
        };
    }, [loadProfile]);

    // ✅ 5. Keep createProfile as is
    const createProfile = async (user: any) => {
        try {
            const { error } = await supabase.from('profiles').insert({
                id: user.id,
                display_name: deriveDisplayName(user, t('profile.defaultName')),
                avatar_url: '',
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

            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: profile.display_name.trim(),
                    phone: profile.phone?.trim() || '',
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
                })
            );

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
            });

            if (!result.canceled) {
                setProfile({ ...profile, avatar_url: result.assets[0].uri });
                setShowAvatarModal(false);
                // TODO: Upload to Supabase Storage
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
            });

            if (!result.canceled) {
                setProfile({ ...profile, avatar_url: result.assets[0].uri });
                setShowAvatarModal(false);
                // TODO: Upload to Supabase Storage
            }
        } catch (error) {
            console.error('Error taking photo:', error);
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
                    await supabase.auth.signOut();
                    await AsyncStorage.removeItem('@user_profile');
                    router.replace('/(auth)/login');
                },
            },
        ]);
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
                        {profile.avatar_url ? (
                            <Image
                                source={{ uri: profile.avatar_url }}
                                style={styles.avatarImage}
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
                    {renderField(
                        'Tryggd ID',
                        profile.username || '',
                        'username',
                        false
                    )}
                    {renderField(
                        t('profile.fields.name'),
                        profile.display_name || '',
                        'display_name'
                    )}
                    {renderField(
                        t('profile.fields.email'),
                        isAppleRelayEmail ? 'Hidden by Apple' : profile.email || '',
                        'email',
                        false
                    )}
                    {renderField(
                        t('profile.fields.phone'),
                        profile.phone || '',
                        'phone'
                    )}
                </View>
            </ScrollView>

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
        backgroundColor: BaseColors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: BaseColors.background,
    },
    loadingIcon: {
        marginBottom: 12,
    },
    loadingText: {
        fontSize: 16,
        color: BaseColors.neutral[500],
    },
    scrollContent: {
        paddingBottom: 40,
    },
    avatarSection: {
        alignItems: 'center',
        marginVertical: GAP,
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
        fontSize: 14,
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
        fontSize: 14,
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
        fontSize: 14,
    },
    infoCard: {
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
    fieldContainer: {
        marginBottom: GAP,
    },
    fieldLabel: {
        fontSize: 14,
        color: BaseColors.text.dark,
        marginBottom: 8,
        fontWeight: '500',
    },
    fieldValue: {
        fontSize: 16,
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
        fontSize: 16,
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
        fontSize: 16,
        fontWeight: '600',
        color: BaseColors.text.dark,
        marginBottom: 2,
    },
    settingsSubtitle: {
        fontSize: 14,
        color: BaseColors.neutral[500],
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: BaseColors.errorLight,
        borderRadius: 16,
        padding: 18,
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: BaseColors.errorBorder,
        gap: 10,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '600',
        color: BaseColors.error,
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
        fontSize: 18,
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
        fontSize: 16,
        color: BaseColors.text.dark,
    },
});
