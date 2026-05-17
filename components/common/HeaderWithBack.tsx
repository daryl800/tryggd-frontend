// app/components/HeaderWithBack.tsx
import BaseColors from "@/constants/colors";
import { ICON_SIZES } from "@/constants/ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { iosFontSize } from '@/constants/typography';

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
                        style={styles.backButtonPosition}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.backButtonStyle}>{"く"}</Text>
                        {/* <Ionicons name="arrow-back" size={24} color="#5FA893" /> */}
                    </TouchableOpacity>
                )}

                {/* Icon and Title */}
                <View style={styles.headerContent}>
                    {iconName && <Ionicons name={iconName} size={ICON_SIZES.LG} color={BaseColors.primary} />}
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
    backButtonPosition: {
        padding: 0,
        marginRight: 5, // Increased gap between < and icon
    },
    backButtonStyle: {
        fontSize: iosFontSize(26),
        fontWeight: '800',
        color: BaseColors.text.dark,
        marginLeft: 8, // Increased gap between icon and title
        flex: 1,
    },
    headerContent: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        marginLeft: -4, // Adjusted to compensate
    },
    headerRightSpacer: {
        width: 36,
    },
    title: {
        fontSize: iosFontSize(32),
        fontWeight: '800',
        color: BaseColors.text.dark,
        marginLeft: 8, // Increased gap between icon and title
        flex: 1,
    }
});