import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    Image,
    Modal,
    Pressable,
    ScrollView,
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

export default function ProfileScreen() {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [showAvatarModal, setShowAvatarModal] = useState(false);
    const [loading, setLoading] = useState(true);

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

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.replace("/(auth)/login");
                return;
            }

            // Fetch profile from Supabase
            const { data, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (error) {
                console.error("Error fetching profile:", error);
                // If profile doesn't exist, create one
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

                // Also save locally for offline use
                await AsyncStorage.setItem("@user_profile", JSON.stringify({
                    display_name: data.display_name || "",
                    email: user.email || "",
                    phone: data.phone || "",
                }));
            }
        } catch (error) {
            console.error("Error loading profile:", error);
            Alert.alert("Fel", "Kunde inte ladda profilen");
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
                    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || "Användare",
                    email: user.email || "",
                    avatar_url: "",
                });

            if (error) {
                console.error("Error creating profile:", error);
                return;
            }

            // Reload profile after creation
            loadProfile();
        } catch (error) {
            console.error("Error creating profile:", error);
        }
    };

    const saveProfile = async () => {
        try {
            setLoading(true);

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                Alert.alert("Fel", "Du är inte inloggad");
                return;
            }

            // Update profile in Supabase
            const { error } = await supabase
                .from("profiles")
                .update({
                    display_name: profile.display_name,
                    phone: profile.phone,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", user.id);

            if (error) {
                console.error("Error updating profile:", error);
                Alert.alert("Fel", "Kunde inte uppdatera profilen");
                return;
            }

            // Update user email if changed (requires auth update)
            if (profile.email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({
                    email: profile.email,
                });

                if (emailError) {
                    console.error("Error updating email:", emailError);
                    Alert.alert("Notis", "Profilen sparades men e-poständring kräver bekräftelse");
                }
            }

            // Save locally for offline use
            await AsyncStorage.setItem("@user_profile", JSON.stringify({
                display_name: profile.display_name,
                email: profile.email,
                phone: profile.phone,
            }));

            setIsEditing(false);
            Alert.alert("Sparat", "Din profil har uppdaterats.");
        } catch (error) {
            console.error("Error saving profile:", error);
            Alert.alert("Fel", "Kunde inte spara profilen");
        } finally {
            setLoading(false);
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
                // Here you would upload to Supabase Storage
                // For now, we'll just update the local state
                setProfile({ ...profile, avatar_url: result.assets[0].uri });
                setShowAvatarModal(false);

                // TODO: Upload to Supabase Storage and update avatar_url
                // await uploadAvatar(result.assets[0].uri);
            }
        } catch (error) {
            console.error("Error picking avatar:", error);
        }
    };

    const takePhoto = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
                Alert.alert("Behörighet", "Kameraåtkomst krävs");
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
        Alert.alert("Logga ut", "Är du säker?", [
            { text: "Avbryt", style: "cancel" },
            {
                text: "Logga ut",
                style: "destructive",
                onPress: async () => {
                    await supabase.auth.signOut();
                    await AsyncStorage.removeItem("@user_profile");
                    router.replace("/(auth)/login");
                },
            },
        ]);
    };

    const renderField = (
        label: string,
        value: string,
        field: keyof UserProfile
    ) => (
        <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 4 }}>
                {label}
            </Text>
            {isEditing ? (
                <TextInput
                    value={value}
                    onChangeText={(t) => setProfile({ ...profile, [field]: t })}
                    style={{
                        backgroundColor: "#F9FAFB",
                        borderWidth: 1,
                        borderColor: "#D1D5DB",
                        borderRadius: 8,
                        padding: 12,
                    }}
                    editable={field !== "email"} // Email requires special handling
                />
            ) : (
                <Text style={{ fontSize: 16, fontWeight: "500" }}>{value}</Text>
            )}
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <Text>Laddar profil...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", padding: 24, paddingBottom: 0 }}>
            <ScrollView style={{ flex: 1 }}>
                {/* Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 28, fontWeight: "700" }}>Profil</Text>
                    {!isEditing ? (
                        <TouchableOpacity onPress={() => setIsEditing(true)}>
                            <Text style={{ color: "#5FA893", fontWeight: "600" }}>
                                Redigera
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity onPress={saveProfile} disabled={loading}>
                            <Text style={{ color: "#5FA893", fontWeight: "600" }}>
                                {loading ? "Sparar..." : "Spara"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Avatar */}
                <View style={{ alignItems: "center", marginVertical: 32 }}>
                    <TouchableOpacity
                        disabled={!isEditing}
                        onPress={() => setShowAvatarModal(true)}
                    >
                        {profile.avatar_url ? (
                            <Image
                                source={{ uri: profile.avatar_url }}
                                style={{
                                    width: 120,
                                    height: 120,
                                    borderRadius: 60,
                                    borderWidth: 3,
                                    borderColor: "#5FA893",
                                }}
                            />
                        ) : (
                            <View
                                style={{
                                    width: 120,
                                    height: 120,
                                    borderRadius: 60,
                                    backgroundColor: "#F3F4F6",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <Ionicons name="person" size={48} color="#9CA3AF" />
                            </View>
                        )}
                    </TouchableOpacity>

                    <Text style={{ fontSize: 18, fontWeight: "600", marginTop: 16 }}>
                        {profile.display_name || "Användare"}
                    </Text>
                    <Text style={{ color: "#6B7280" }}>{profile.email}</Text>
                </View>

                {/* Info */}
                <View style={{ backgroundColor: "#F9FAFB", padding: 20, borderRadius: 12 }}>
                    {renderField("Namn", profile.display_name || "", "display_name")}
                    {renderField("E-post", profile.email || "", "email")}
                    {renderField("Telefon", profile.phone || "", "phone")}
                </View>

                {/* Settings entry */}
                <TouchableOpacity
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 20,
                    }}
                    onPress={() => router.push("../settings")}
                >
                    <Ionicons name="settings-outline" size={22} />
                    <Text style={{ marginLeft: 12, fontSize: 16 }}>Inställningar</Text>
                </TouchableOpacity>

                {/* Logout */}
                <TouchableOpacity
                    style={{ paddingVertical: 20 }}
                    onPress={handleLogout}
                >
                    <Text style={{ color: "#EF4444", fontSize: 16 }}>Logga ut</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Avatar modal */}
            <Modal visible={showAvatarModal} transparent animationType="slide">
                <Pressable
                    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
                    onPress={() => setShowAvatarModal(false)}
                >
                    <Pressable style={{
                        position: "absolute",
                        bottom: 0,
                        width: "100%",
                        backgroundColor: "#fff",
                        borderTopLeftRadius: 16,
                        borderTopRightRadius: 16,
                        paddingBottom: 40
                    }}>
                        <TouchableOpacity
                            onPress={pickAvatar}
                            style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}
                        >
                            <Text style={{ fontSize: 16 }}>Välj från bibliotek</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={takePhoto}
                            style={{ padding: 20 }}
                        >
                            <Text style={{ fontSize: 16 }}>Ta foto</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

        </SafeAreaView>
    );
}