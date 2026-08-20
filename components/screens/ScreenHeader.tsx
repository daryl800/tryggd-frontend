// components/screens/ScreenHeader.tsx - UPDATED VERSION
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { ICON_SIZES } from '@/constants/ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, View, ViewProps } from 'react-native';
import { iosFontSize } from '@/constants/typography';

interface ScreenHeaderProps extends ViewProps {
    title: string;
    subtitle?: string;
    iconName?: keyof typeof Ionicons.glyphMap;
    rightElement?: React.ReactNode;
    // Sits to the right of the title itself (the name line), not the
    // greeting line above it — separate from rightElement so callers can
    // use both independently (e.g. a streak badge next to the name, plus
    // debug buttons next to the greeting).
    titleRightElement?: React.ReactNode;
    showGreetingInLine?: boolean;
    // New optional props for title scaling
    titleNumberOfLines?: number;
    titleAdjustsFontSizeToFit?: boolean;
    titleMinimumFontScale?: number;
    // Optional color overrides — used when the header sits over a photo/gradient
    // background instead of the default flat surface. Leave unset elsewhere;
    // defaults match the original dark-text-on-light-surface look.
    titleColor?: string;
    subtitleColor?: string;
    iconColor?: string;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
    title,
    subtitle,
    iconName = 'pulse',
    rightElement,
    titleRightElement,
    showGreetingInLine = false,
    titleNumberOfLines = 1,
    titleAdjustsFontSizeToFit = true,
    titleMinimumFontScale = 0.7,
    titleColor,
    subtitleColor,
    iconColor,
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
                            <Ionicons name={iconName} size={ICON_SIZES.MD} color={iconColor ?? BaseColors.primary} />
                            <Text
                                style={[styles.greetingText, subtitleColor ? { color: subtitleColor } : null]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                            >
                                {subtitle}
                            </Text>
                        </View>
                        {rightElement}
                    </View>
                    <View style={styles.titleRow}>
                        <Text
                            style={[styles.titleLarge, styles.titleLargeFlex, titleColor ? { color: titleColor } : null]}
                            numberOfLines={titleNumberOfLines}
                            adjustsFontSizeToFit={titleAdjustsFontSizeToFit}
                            minimumFontScale={titleMinimumFontScale}
                            maxFontSizeMultiplier={1.2}
                        >
                            {title}
                        </Text>
                        {titleRightElement}
                    </View>
                </>
            ) : (
                // Layout for other screens: Title with icon, optional subtitle
                <>
                    <View style={styles.headerRow}>
                        <Ionicons name={iconName} size={28} color={BaseColors.primary} />
                        <Text
                            style={styles.title}
                            numberOfLines={titleNumberOfLines}
                            adjustsFontSizeToFit={titleAdjustsFontSizeToFit}
                            minimumFontScale={titleMinimumFontScale}
                            maxFontSizeMultiplier={1.2}
                        >
                            {title}
                        </Text>
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
        marginBottom: 5,
    },

    // Regular layout (for Activity, Statistics, etc.)
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        fontSize: iosFontSize(32),
        fontWeight: '800',
        color: BaseColors.text.dark,
        marginLeft: 12,
        flex: 1,
        // Platform-specific optimizations
        ...Platform.select({
            ios: {
                includeFontPadding: false,
            },
            android: {
                includeFontPadding: false,
                textAlignVertical: 'center',
            },
        }),
    },
    subtitle: {
        fontSize: iosFontSize(16),
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
        fontSize: iosFontSize(18),
        color: BaseColors.neutral[500],
        fontWeight: '500',
        textTransform: 'capitalize',
        marginLeft: 8,
        flexShrink: 1,
        minWidth: 0,
    },
    // Row so an optional element (e.g. a streak badge) can sit to the right
    // of the name itself, right-aligned, on its own line — separate from
    // greetingRow above, which holds the "Good morning" line + rightElement.
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    titleLarge: {
        fontSize: iosFontSize(34),
        fontWeight: '800',
        color: BaseColors.text.dark,
        // Platform-specific optimizations
        ...Platform.select({
            ios: {
                includeFontPadding: false,
            },
            android: {
                includeFontPadding: false,
                textAlignVertical: 'center',
            },
        }),
    },
    // Lets the name shrink/ellipsize instead of pushing titleRightElement
    // off-screen when the display name is long.
    titleLargeFlex: {
        flexShrink: 1,
        marginRight: 8,
    },
});
