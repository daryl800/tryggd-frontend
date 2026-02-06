// constants/ui.ts
import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Screen measurements
export const SCREEN = {
    WIDTH: SCREEN_WIDTH,
    HEIGHT: SCREEN_HEIGHT,
    PADDING_HORIZONTAL: 20,
    PADDING_VERTICAL: 16,
};

// Spacing system (8-point grid)
export const SPACING = {
    XS: 4,
    SM: 8,
    MD: 16,
    LG: 24,
    XL: 32,
    XXL: 40,
};

// Icon sizes (consistent across app)
export const ICON_SIZES = {
    XS: 16,
    SM: 20,
    MD: 24,
    LG: 28,
    XL: 32,
    XXL: 40,
    HUGE: 52,
    SUPER_HUGE: 60,
};

// Font sizes
export const FONT_SIZES = {
    XS: 12,
    SM: 14,
    MD: 16,
    LG: 18,
    XL: 20,
    XXL: 22,
    TITLE: 28,
    DISPLAY: 32,
};

// Border radius
export const BORDER_RADIUS = {
    SM: 8,
    MD: 12,
    LG: 16,
    XL: 20,
    CIRCLE: 999,
};

// Common component sizes
export const COMPONENT_SIZES = {
    HEADER_HEIGHT: 56,
    TAB_BAR_HEIGHT: Platform.OS === 'ios' ? 85 : 60,
    BUTTON_HEIGHT: 48,
    INPUT_HEIGHT: 52,
    AVATAR_SM: 40,
    AVATAR_MD: 80,
    AVATAR_LG: 120,
};

// Animation durations
export const ANIMATION = {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
};