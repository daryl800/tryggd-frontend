// app/components/HeaderWithBack.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface HeaderWithBackProps {
    title: string;
    iconName?: keyof typeof Ionicons.glyphMap;
    onBackPress?: () => void;
    rightElement?: ReactNode;
    showBackButton?: boolean;
}

export default function HeaderWithBack({
    title,
    iconName,
    onBackPress,
    rightElement,
    showBackButton = true
}: HeaderWithBackProps) {
    const router = useRouter();

    const handleBackPress = () => {
        if (onBackPress) {
            onBackPress();
        } else {
            router.back();
        }
    };

    return (
        <View style={styles.header}>
            <View style={styles.headerRow}>
                {/* Back Button */}
                {showBackButton && (
                    <TouchableOpacity
                        onPress={handleBackPress}
                        style={styles.backButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.title}>{"く"}</Text>
                        {/* <Ionicons name="arrow-back" size={24} color="#5FA893" /> */}
                    </TouchableOpacity>
                )}

                {/* Icon and Title */}
                <View style={styles.headerContent}>
                    {iconName && <Ionicons name={iconName} size={28} color="#5FA893" />}
                    <Text style={styles.title}>{title}</Text>
                </View>

                {/* Right Element or Spacer */}
                {rightElement || <View style={styles.headerRightSpacer} />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 0,
        paddingTop: 16,
        marginBottom: 24,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    backButton: {
        padding: 0,
        marginRight: 6,
    },
    headerContent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    headerRightSpacer: {
        width: 36,
    },
    title: {
        fontSize: 22,
        fontWeight: "600",
        marginLeft: 10,
        color: "#1F2937",
    },
});