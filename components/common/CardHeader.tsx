// components/common/CardHeader.tsx
import { BaseColors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface CardHeaderProps {
    title: string;
    iconName?: keyof typeof Ionicons.glyphMap;
    count?: number;
    iconSize?: number;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
    title,
    iconName = 'people',
    count,
    iconSize = 20,
}) => {
    return (
        <View style={styles.container}>
            <Ionicons name={iconName} size={iconSize} color={BaseColors.primary} />
            <Text style={styles.title}>{title}</Text>
            {count !== undefined && count > 0 && (
                <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: BaseColors.neutral[200],
    },
    title: {
        fontWeight: '600',
        fontSize: 16,
        marginLeft: 6,
        flex: 1,
        color: BaseColors.text.dark,
    },
    countBadge: {
        backgroundColor: BaseColors.primaryLight,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        minWidth: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countText: {
        fontSize: 11,
        fontWeight: '600',
        color: BaseColors.primary,
    },
});