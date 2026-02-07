// components/common/Card.tsx
import { BaseColors } from '@/constants/colors';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface CardProps extends TouchableOpacityProps {
    variant?: 'default' | 'error' | 'primary';
    children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
    variant = 'default',
    children,
    style,
    ...props
}) => {
    const getVariantStyle = () => {
        switch (variant) {
            case 'error':
                return styles.errorCard;
            case 'primary':
                return styles.primaryCard;
            default:
                return styles.defaultCard;
        }
    };

    return (
        <TouchableOpacity
            style={[styles.card, getVariantStyle(), style]}
            activeOpacity={0.8}
            {...props}
        >
            {children}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        flex: 1,
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        minHeight: 100,
        justifyContent: 'space-between',
        ...Platform.select({
            ios: {
                shadowColor: BaseColors.shadowColor,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 8,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    defaultCard: {
        backgroundColor: BaseColors.surface,
        borderColor: BaseColors.neutral[200],
    },
    errorCard: {
        backgroundColor: BaseColors.errorLight,
        borderColor: BaseColors.errorBorder,
    },
    primaryCard: {
        backgroundColor: BaseColors.primaryLight,
        borderColor: BaseColors.primaryBorder,
    },
});