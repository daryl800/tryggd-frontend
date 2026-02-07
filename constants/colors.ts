// constants/colors.ts
/**
 * Consolidated color palette - single source of truth
 * Contains ONLY color definitions, no theme logic
 */

// Base color palette
export const BaseColors = {
    // Primary colors
    primary: '#5FA893',
    primaryLight: '#F0F9F6',
    primaryDark: '#4A8773',
    primaryBorder: '#E0F2E9',

    // Text colors
    text: {
        dark: '#1F2937',
        muted: '#5E7F74',
        light: '#9CA3AF',
        white: '#FFFFFF',
        black: '#000000',
    },

    // UI colors
    surface: '#FFFFFF',
    background: '#FAFAFA',
    border: '#E5E7EB',
    highlight: '#FF4433',
    shadowColor: '#00000033', // 20% opacity black for shadows

    // Status colors
    success: '#10B981',
    successLight: '#ECFDF5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    error: '#EF4444',
    errorLight: '#FEF2F2',
    errorBorder: '#FECACA',
    info: '#3B82F6',
    infoLight: '#EFF6FF',

    // Neutral scale (for consistent grays)
    neutral: {
        50: '#F9FAFB',
        100: '#F3F4F6',
        200: '#E5E7EB',
        300: '#D1D5DB',
        400: '#9CA3AF',
        500: '#6B7280',
        600: '#4B5563',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
    },

    // Additional UI colors from your screens
    cardShadow: '#000',
    cardShadowOpacity: 0.05,
    emptyStateIcon: '#D1D5DB',

    // Legacy colors (for backward compatibility)
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#5FA893',

    // Home screen specific colors
    progressRingBackground: '#7DC4B0',
    progressRingGradientEnd: '#7DC4B0',
    cardIconBackground: {
        activity: '#EDF7F4',
        streak: '#FFF7ED',
        reset: '#FEF2F2',
    },

    // Text variants
    textMuted: '#6B7280',
    textSuccess: '#10B981',

    // Border colors
    borderLight: '#F3F4F6',

};

// For direct access if needed
export default BaseColors;