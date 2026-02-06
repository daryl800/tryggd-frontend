// components/common/Header.tsx
import colors from '@/constants/colors';
import { ICON_SIZES } from '@/constants/ui';
import { commonStyles } from '@/styles/common';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface HeaderProps {
    title: string;
    showBack?: boolean;
    onBackPress?: () => void;
    rightButton?: React.ReactNode;
    iconName?: string;
}

export const Header: React.FC<HeaderProps> = ({
    title,
    showBack = false,
    onBackPress,
    rightButton,
    iconName = 'people',
}) => {
    return (
        <View style={commonStyles.header}>
            <View style={commonStyles.headerRow}>
                {showBack ? (
                    <TouchableOpacity onPress={onBackPress} style={{ marginRight: 8 }}>
                        <Ionicons
                            name="arrow-back"
                            size={ICON_SIZES.LG}
                            color={colors.primary}
                        />
                    </TouchableOpacity>
                ) : (
                    <Ionicons
                        name={iconName as any}
                        size={ICON_SIZES.LG}
                        color={colors.primary}
                    />
                )}
                <Text style={commonStyles.headerTitle}>{title}</Text>
            </View>
            {rightButton}
        </View>
    );
};