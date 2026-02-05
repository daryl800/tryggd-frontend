import colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next"; // ADD THIS
import {
    Alert,
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

type UserProfile = {
    id: string;
    display_name: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProfileScreen() {
    const router = useRouter();
    const { t } = useTranslation(); // ADD THIS
    const [isEditing, setIsEditing] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState<UserProfile>({
        id: "",
        display_name: "",
        email: "",
        phone: "",
        avatar_url: "",
    });

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.replace("/(auth)/login");
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (error) {
                console.error("Error fetching profile:", error);
                await createProfile(user);
                return;
            }

            if (data) {
                setProfile({
                    id: data.id,
                    display_name: data.display_name || "",
                    email: user.email || "",
                    phone: data.phone || "",
                    avatar_url: data.avatar_url || "",
                });

                await AsyncStorage.setItem("@user_profile", JSON.stringify({
                    display_name: data.display_name || "",
                    email: user.email || "",
                    phone: data.phone || "",
                }));
            }
        } catch (error) {
            console.error("Error loading profile:", error);
            Alert.alert(t("errors.title"), t("profile.errors.loadProfile"));
        } finally {
            setLoading(false);
        }
    };

    const createProfile = async (user: any) => {
        try {
            const { error } = await supabase
                .from("profiles")
                .insert({
                    id: user.id,
                    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || t("profile.defaultName"),
                    email: user.email || "",
                    avatar_url: "",
                });

            if (error) {
                console.error("Error creating profile:", error);
                return;
            }

            loadProfile();
        } catch (error) {
            console.error("Error creating profile:", error);
        }
    };

    const saveProfile = async () => {
        try {
            setSaving(true);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                Alert.alert(t("errors.title"), t("profile.errors.notLoggedIn"));
                return;
            }

            const { error } = await supabase
                .from("profiles")
                .update({
                    display_name: profile.display_name.trim(),
                    phone: profile.phone?.trim() || "",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

            if (error) {
                console.error("Error updating profile:", error);
                Alert.alert(t("errors.title"), t("profile.errors.updateProfile"));
                return;
            }

            if (profile.email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({
                    email: profile.email,
                });

                if (emailError) {
                    console.error("Error updating email:", emailError);
                    Alert.alert(t("profile.notices.title"), t("profile.notices.emailConfirmation"));
                }
            }

            await AsyncStorage.setItem("@user_profile", JSON.stringify({
                display_name: profile.display_name,
                email: profile.email,
                phone: profile.phone,
            }));

            setIsEditing(false);
            Alert.alert(t("profile.success.title"), t("profile.success.saved"));
        } catch (error) {
            console.error("Error saving profile:", error);
            Alert.alert(t("errors.title"), t("profile.errors.saveProfile"));
        } finally {
            setSaving(false);
        }
    };

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
            console.error("Error picking avatar:", error);
        }
    };

    const takePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
                Alert.alert(t("permissions.title"), t("profile.permissions.camera"));
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
            console.error("Error taking photo:", error);
        }
    };

    const handleLogout = async () => {
        Alert.alert(t("profile.logout.title"), t("profile.logout.confirm"), [
            {
                text: t("common.cancel"),
                style: "cancel",
            },
            {
                text: t("profile.logout.button"),
                style: "destructive",
                onPress: async () => {
                    await supabase.auth.signOut();
                    await AsyncStorage.removeItem("@user_profile");
                    router.replace("/(auth)/login");
                },
            },
        ]);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        loadProfile(); // Reload original data
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
                    style={[
                        styles.input,
                        !editable && styles.inputDisabled
                    ]}
                    editable={editable}
                    placeholderTextColor="#9CA3AF"
                />
            ) : (
                <Text style={styles.fieldValue}>
                    {value || <Text style={styles.placeholderText}>{t("profile.fields.notSpecified")}</Text>}
                </Text>
            )}
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <Ionicons name="refresh" size={40} color="#9CA3AF" style={styles.loadingIcon} />
                <Text style={styles.loadingText}>{t("profile.loading")}</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <Ionicons name="person-circle" size={28} color="#5FA893" />
                        <Text style={styles.title}>{t("profile.title")}</Text>
                    </View>
                </View>

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
                                <Ionicons name="person" size={52} color="#9CA3AF" />
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
                            <Ionicons name="create-outline" size={20} color="#5FA893" />
                            <Text style={styles.editButtonText}>{t("profile.buttons.edit")}</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.editActions}>
                            <TouchableOpacity
                                onPress={cancelEdit}
                                style={[styles.actionButton, styles.cancelButton]}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveProfile}
                                disabled={saving}
                                style={[styles.actionButton, styles.saveButton, saving && styles.saveButtonDisabled]}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="save-outline" size={18} color="#fff" />
                                <Text style={styles.saveButtonText}>
                                    {saving ? t("profile.buttons.saving") : t("profile.buttons.save")}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Profile Info Card */}
                <View style={styles.infoCard}>
                    {renderField(t("profile.fields.name"), profile.display_name || "", "display_name")}
                    {renderField(t("profile.fields.email"), profile.email || "", "email", false)}
                    {renderField(t("profile.fields.phone"), profile.phone || "", "phone")}
                </View>

                {/* Settings Card */}
                <TouchableOpacity
                    style={styles.settingsCard}
                    onPress={() => router.push("../settings")}
                    activeOpacity={0.7}
                >
                    <View style={styles.settingsContent}>
                        <View style={styles.settingsIconContainer}>
                            <Ionicons name="settings-outline" size={22} color="#5FA893" />
                        </View>
                        <View style={styles.settingsTextContainer}>
                            <Text style={styles.settingsTitle}>{t("profile.settings.title")}</Text>
                            <Text style={styles.settingsSubtitle}>{t("profile.settings.subtitle")}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                    </View>
                </TouchableOpacity>

                {/* Logout Button */}
                <TouchableOpacity
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                >
                    <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                    <Text style={styles.logoutText}>{t("profile.buttons.logout")}</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Avatar Selection Modal */}
            <Modal visible={showAvatarModal} transparent animationType="fade">
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowAvatarModal(false)}
                >
                    <Pressable style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t("profile.avatarModal.title")}</Text>
                            <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                                <Ionicons name="close" size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={pickAvatar}
                            style={styles.modalOption}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="images-outline" size={24} color="#5FA893" />
                            <Text style={styles.modalOptionText}>{t("profile.avatarModal.chooseFromLibrary")}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={takePhoto}
                            style={styles.modalOption}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="camera-outline" size={24} color="#5FA893" />
                            <Text style={styles.modalOptionText}>{t("profile.avatarModal.takePhoto")}</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

// ==================== STYLES ====================
const GAP = 16;
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
    },
    loadingIcon: {
        marginBottom: 12,
    },
    loadingText: {
        fontSize: 16,
        color: "#6B7280",
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        marginBottom: 0,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    title: {
        fontSize: 22,
        fontWeight: "600",
        marginLeft: 8,
        color: colors.text.dark
    },
    editButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: "#EDF7F4",
        borderRadius: 12,
    },
    editButtonText: {
        marginLeft: 6,
        color: "#5FA893",
        fontWeight: "600",
        fontSize: 14,
    },
    editActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    actionButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
    },
    cancelButton: {
        backgroundColor: "#F3F4F6",
    },
    cancelButtonText: {
        color: "#6B7280",
        fontWeight: "600",
        fontSize: 14,
    },
    saveButton: {
        backgroundColor: "#5FA893",
        ...Platform.select({
            ios: {
                shadowColor: '#5FA893',
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
        backgroundColor: "#9CA3AF",
    },
    saveButtonText: {
        marginLeft: 6,
        color: "#fff",
        fontWeight: "600",
        fontSize: 14,
    },
    avatarSection: {
        alignItems: "center",
        marginVertical: GAP,
        paddingHorizontal: 20,
    },
    avatarTouchable: {
        position: "relative",
        marginBottom: 16,
    },
    avatarImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
        borderColor: "#5FA893",
    },
    avatarPlaceholder: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: "#E5E7EB",
    },
    editOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        borderRadius: 60,
        alignItems: "center",
        justifyContent: "center",
    },
    displayName: {
        fontSize: 24,
        fontWeight: "700",
        color: "#1F2937",
        marginBottom: 4,
    },
    emailText: {
        fontSize: 15,
        color: "#6B7280",
    },
    infoCard: {
        backgroundColor: "#F9FAFB",
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginBottom: GAP,
        borderWidth: 1,
        borderColor: "#F3F4F6",
        ...Platform.select({
            ios: {
                shadowColor: '#000',
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
        color: "#6B7280",
        marginBottom: 8,
        fontWeight: "500",
    },
    fieldValue: {
        fontSize: 16,
        fontWeight: "500",
        color: "#1F2937",
    },
    placeholderText: {
        color: "#9CA3AF",
        fontStyle: "italic",
    },
    input: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: "#1F2937",
        borderWidth: 1,
        borderColor: "#E5E7EB",
    },
    inputDisabled: {
        backgroundColor: "#F9FAFB",
        color: "#6B7280",
    },
    settingsCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        padding: 20,
        marginHorizontal: 20,
        marginBottom: GAP,
        borderWidth: 1,
        borderColor: "#F3F4F6",
        ...Platform.select({
            ios: {
                shadowColor: '#000',
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
        flexDirection: "row",
        alignItems: "center",
    },
    settingsIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: "#EDF7F4",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
    },
    settingsTextContainer: {
        flex: 1,
    },
    settingsTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#1F2937",
        marginBottom: 2,
    },
    settingsSubtitle: {
        fontSize: 14,
        color: "#6B7280",
    },
    logoutButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FEF2F2",
        borderRadius: 16,
        padding: 18,
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: "#FEE2E2",
        gap: 10,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#EF4444",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
    },
    modalContent: {
        backgroundColor: "#fff",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: "600",
        color: "#1F2937",
    },
    modalOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 18,
        gap: 16,
    },
    modalOptionText: {
        fontSize: 16,
        color: "#1F2937",
    },
});