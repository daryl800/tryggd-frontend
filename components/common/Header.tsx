// components/common/Header.tsx
import { BaseColors } from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { iosFontSize } from '@/constants/typography';

interface HeaderProps {
    title: string;
    showBack?: boolean;
    onBackPress?: () => void;
    rightButton?: React.ReactNode;
    iconName?: keyof typeof Ionicons.glyphMap;
}

export const Header: React.FC<HeaderProps> = ({
    title,
    showBack = false,
    onBackPress,
    rightButton,
    iconName = 'people',
}) => {
    return (
        <View style={styles.header}>
            <View style={styles.headerRow}>
                {showBack ? (
                    <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={ICON_SIZES.LG} color={BaseColors.primary} />
                    </TouchableOpacity>
                ) : (
                    <Ionicons name={iconName} size={ICON_SIZES.LG} color={BaseColors.primary} />
                )}
                <Text style={styles.headerTitle}>{title}</Text>
            </View>
            {rightButton}
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: BaseColors.surface,
        borderBottomWidth: 1,
        borderBottomColor: BaseColors.border,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    backButton: {
        marginRight: 8,
    },
    headerTitle: {
        fontSize: iosFontSize(20),
        fontWeight: '700',
        color: BaseColors.text.dark,
        marginLeft: 12,
    },
});