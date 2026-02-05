// i18n/types.ts
export interface TranslationKeys {
    // Settings screen
    title: string;
    language: string;
    theme: string;
    light: string;
    dark: string;
    systemDefault: string;
    notifications: string;
    notificationsDesc: string;
    about: string;
    privacy: string;
    terms: string;
    logout: string;
    resetData: string;
    resetWarning: string;
    confirmReset: string;
    cancel: string;
    logoutConfirm: string;
    ok: string;
    account: string;
    information: string;

    // Language names
    swedish: string;
    english: string;
    norwegian: string;
    danish: string;
    finnish: string;
    chineseSimplified: string;
    chineseTraditional: string;
}

// Type for all supported languages
export type SupportedLanguage =
    | 'en'
    | 'sv'
    | 'no'
    | 'da'
    | 'fi'
    | 'zh-Hans'
    | 'zh-Hant';

declare module 'i18next' {
    interface CustomTypeOptions {
        resources: {
            translation: TranslationKeys;
        };
    }
}