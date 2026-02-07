// components/screens/ScreenHeader.tsx - FIXED VERSION
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, ViewProps } from 'react-native';

interface ScreenHeaderProps extends ViewProps {
    title: string;
    subtitle?: string;
    iconName?: keyof typeof Ionicons.glyphMap;
    rightElement?: React.ReactNode;
    showGreetingInLine?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    title,
    subtitle,
    iconName = 'pulse',
    rightElement,
    showGreetingInLine = false,
    style,
    ...props
}) => {
    return (
        <View style={[styles.container, style]} {...props}>
            {showGreetingInLine ? (
                // Layout for HomeScreen: Greeting icon, text, and profile button in one line
                <>
                    <View style={styles.greetingRow}>
                        <View style={styles.greetingLeft}>
                            <Ionicons name={iconName} size={ICON_SIZES.MD} color={BaseColors.primary} />
                            <Text style={styles.greetingText}>{subtitle}</Text>
                        </View>
                        {rightElement}
                    </View>
                    <Text style={styles.titleLarge}>{title}</Text>
                </>
            ) : (
                // Layout for other screens: Title with icon, optional subtitle
                <>
                    <View style={styles.headerRow}>
                        <Ionicons name={iconName} size={28} color={BaseColors.primary} />
                        <Text style={styles.title}>{title}</Text>
                        {rightElement}
                    </View>
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: SCREEN_PADDING.horizontal,
        paddingTop: SCREEN_PADDING.top,
        marginBottom: 10,
    },

    // Regular layout (for Activity, Statistics, etc.)
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: BaseColors.text.dark,
        marginLeft: 12,
        flex: 1,
    },
    subtitle: {
        fontSize: 16,
        color: BaseColors.text.light,
        marginTop: 8,
        marginLeft: 40, // Align with title (icon width + margin)
    },

    // HomeScreen layout
    greetingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    greetingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    greetingText: {
        fontSize: 16,
        color: BaseColors.neutral[500],
        fontWeight: '500',
        textTransform: 'capitalize',
        marginLeft: 8,
    },
    titleLarge: {
        fontSize: 32,
        fontWeight: '800',
        color: BaseColors.text.dark,
    },
});