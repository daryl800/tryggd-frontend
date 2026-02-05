/**
 * Theme configuration for the app
 * Uses colors from colors.ts to build light/dark themes
 */

import { Platform } from 'react-native';
import { BaseColors } from './colors';

// Build themes using BaseColors
export const Themes = {
  light: {
    // Text
    text: BaseColors.text.dark,
    textSecondary: BaseColors.text.muted,
    textTertiary: BaseColors.text.light,

    // Backgrounds
    background: BaseColors.surface,
    backgroundSecondary: BaseColors.background,
    backgroundTertiary: BaseColors.neutral[100],

    // Surfaces
    surface: BaseColors.surface,
    surfaceSecondary: BaseColors.neutral[50],
    surfaceTertiary: BaseColors.neutral[100],

    // Borders
    border: BaseColors.border,
    borderSecondary: BaseColors.neutral[200],

    // Tints
    tint: BaseColors.primary,
    icon: BaseColors.icon,
    tabIconDefault: BaseColors.tabIconDefault,
    tabIconSelected: BaseColors.tabIconSelected,

    // Components
    card: BaseColors.surface,
    cardActive: BaseColors.neutral[100],
    inputBackground: BaseColors.surface,
    buttonPrimary: BaseColors.primary,
    buttonPrimaryText: BaseColors.text.white,
  },

  dark: {
    // Text
    text: BaseColors.text.white,
    textSecondary: BaseColors.neutral[300],
    textTertiary: BaseColors.neutral[400],

    // Backgrounds
    background: BaseColors.text.black,
    backgroundSecondary: BaseColors.neutral[900],
    backgroundTertiary: BaseColors.neutral[800],

    // Surfaces
    surface: BaseColors.neutral[900],
    surfaceSecondary: BaseColors.neutral[800],
    surfaceTertiary: BaseColors.neutral[700],

    // Borders
    border: BaseColors.neutral[700],
    borderSecondary: BaseColors.neutral[600],

    // Tints
    tint: BaseColors.text.white,
    icon: BaseColors.neutral[400],
    tabIconDefault: BaseColors.neutral[400],
    tabIconSelected: BaseColors.text.white,

    // Components
    card: BaseColors.neutral[800],
    cardActive: BaseColors.neutral[700],
    inputBackground: BaseColors.neutral[800],
    buttonPrimary: BaseColors.primary,
    buttonPrimaryText: BaseColors.text.white,
  },
};

// Export for backward compatibility
export const Colors = Themes;

// Fonts (separate from colors)
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Helper function to get theme
export const getThemeColors = (mode: 'light' | 'dark' = 'light') => {
  return Themes[mode];
};

// Type exports
export type ThemeType = typeof Themes.light;
export type ThemeMode = keyof typeof Themes;

// You can also export BaseColors if needed elsewhere
export { BaseColors };
