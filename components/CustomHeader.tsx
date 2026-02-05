import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface CustomHeaderProps {
    title: string;
    showBackButton?: boolean;
    onBackPress?: () => void;
    rightElement?: React.ReactNode;
}

export default function CustomHeader({
    title,
    showBackButton = false,
    onBackPress,
    rightElement
}: CustomHeaderProps) {
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
            <View style={styles.headerLeft}>
                {showBackButton && (
                    <TouchableOpacity
                        onPress={handleBackPress}
                        style={styles.backButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="arrow-back" size={24} color="#5FA893" />
                    </TouchableOpacity>
                )}
            </View>

            <Text style={styles.title}>{title}</Text>

            <View style={styles.headerRight}>
                {rightElement}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerLeft: {
        minWidth: 40,
        alignItems: 'flex-start',
    },
    headerRight: {
        minWidth: 40,
        alignItems: 'flex-end',
    },
    backButton: {
        padding: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
        textAlign: 'center',
        flex: 1,
    },
});