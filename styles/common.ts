// styles/common.ts
import colors from '@/constants/colors';
import {
    BORDER_RADIUS,
    COMPONENT_SIZES,
    FONT_SIZES,
    ICON_SIZES,
    SCREEN,
    SPACING
} from '@/constants/ui';
import { Platform, StyleSheet } from 'react-native';

export const commonStyles = StyleSheet.create({
    // ===== CONTAINERS =====
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },

    screenContainer: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: SCREEN.PADDING_HORIZONTAL,
        paddingTop: SPACING.MD,
        paddingBottom: SPACING.XL,
    },

    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },

    // ===== HEADERS =====
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.LG,
    },

    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    headerTitle: {
        fontSize: FONT_SIZES.XXL,
        fontWeight: '800',
        color: colors.text.dark,
        marginLeft: SPACING.SM,
    },

    headerIcon: {
        width: ICON_SIZES.LG,
        height: ICON_SIZES.LG,
    },

    // ===== CARDS =====
    card: {
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.LG,
        padding: SPACING.MD,
        marginBottom: SPACING.MD,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },

    // ===== BUTTONS =====
    button: {
        height: COMPONENT_SIZES.BUTTON_HEIGHT,
        borderRadius: BORDER_RADIUS.MD,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },

    buttonPrimary: {
        backgroundColor: colors.primary,
    },

    buttonSecondary: {
        backgroundColor: colors.primaryDark,
    },

    buttonText: {
        fontSize: FONT_SIZES.MD,
        fontWeight: '600',
        color: '#fff',
    },

    // ===== INPUTS =====
    input: {
        height: COMPONENT_SIZES.INPUT_HEIGHT,
        backgroundColor: colors.surface,
        borderRadius: BORDER_RADIUS.MD,
        paddingHorizontal: SPACING.MD,
        fontSize: FONT_SIZES.MD,
        color: colors.text.dark,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },

    // ===== TEXT STYLES =====
    textTitle: {
        fontSize: FONT_SIZES.XXL,
        fontWeight: '800',
        color: colors.text.dark,
    },

    textSubtitle: {
        fontSize: FONT_SIZES.MD,
        color: colors.text.light,
    },

    textBody: {
        fontSize: FONT_SIZES.MD,
        color: colors.text.dark,
    },

    textCaption: {
        fontSize: FONT_SIZES.SM,
        color: colors.text.light,
    },

    // ===== ICON CONTAINERS =====
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: BORDER_RADIUS.MD,
        alignItems: 'center',
        justifyContent: 'center',
    },

    iconContainerPrimary: {
        backgroundColor: '#EDF7F4',
    },

    iconContainerSecondary: {
        backgroundColor: '#FFF7ED',
    },
});

// Helper functions for responsive design
export const responsive = {
    width: (percentage: number) => SCREEN.WIDTH * (percentage / 100),
    height: (percentage: number) => SCREEN.HEIGHT * (percentage / 100),
    font: (size: number) => size * (SCREEN.WIDTH / 375), // Base on iPhone 375 width
};
