// components/common/Card.tsx
import { commonStyles } from '@/styles/common';
import React from 'react';
import { View, ViewProps } from 'react-native';

interface CardProps extends ViewProps {
    children: React.ReactNode;
    variant?: 'default' | 'primary' | 'secondary';
}

export const Card: React.FC<CardProps> = ({
    children,
    variant = 'default',
    style,
    ...props
}) => {
    const variantStyle = {
        default: {},
        primary: { backgroundColor: '#EDF7F4', borderColor: '#5FA893' },
        secondary: { backgroundColor: '#FFF7ED', borderColor: '#F59E0B' },
    }[variant];

    return (
        <View style={[commonStyles.card, variantStyle, style]} {...props}>
            {children}
        </View>
    );
};