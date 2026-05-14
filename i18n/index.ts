// i18n/index.ts - WITH TYPE ASSERTION
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
    da: { translation: require('./locales/da.json') },
    en: { translation: require('./locales/en.json') },
    fi: { translation: require('./locales/fi.json') },
    fr: { translation: require('./locales/fr.json') },
    de: { translation: require('./locales/de.json') },
    it: { translation: require('./locales/it.json') },
    ja: { translation: require('./locales/ja.json') },
    ko: { translation: require('./locales/ko.json') },
    no: { translation: require('./locales/no.json') },
    es: { translation: require('./locales/es.json') },
    sv: { translation: require('./locales/sv.json') },
    'zh-Hans': { translation: require('./locales/zh-Hans.json') },
    'zh-Hant': { translation: require('./locales/zh-Hant.json') },
};

export const LANGUAGE_STORAGE_KEY = '@app_language';
const SUPPORTED_LANGUAGES = Object.keys(resources);

export function resolveSupportedLanguage(language?: string | null): string {
    if (!language) return 'en';

    if (SUPPORTED_LANGUAGES.includes(language)) {
        return language;
    }

    const normalized = language.toLowerCase();

    if (normalized.startsWith('zh')) {
        if (normalized.includes('hant') || normalized.includes('tw') || normalized.includes('hk') || normalized.includes('mo')) {
            return 'zh-Hant';
        }
        return 'zh-Hans';
    }

    const base = normalized.split('-')[0];
    return SUPPORTED_LANGUAGES.includes(base) ? base : 'en';
}

export function getDevicePreferredLanguage(): string {
    const locales = Localization.getLocales();
    const preferred = locales[0]?.languageTag ?? locales[0]?.languageCode ?? 'en';
    return resolveSupportedLanguage(preferred);
}

const languageDetector = {
    type: 'languageDetector' as const,
    async: true,
    detect: async (callback: (lang: string) => void) => {
        try {
            const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (savedLanguage) {
                callback(resolveSupportedLanguage(savedLanguage));
                return;
            }
            callback(getDevicePreferredLanguage());
        } catch (error) {
            callback(getDevicePreferredLanguage());
        }
    },
    init: () => { },
    cacheUserLanguage: async (language: string) => {
        try {
            await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, resolveSupportedLanguage(language));
        } catch (error) {
            console.error('Failed to save language:', error);
        }
    }
};

// Use type assertion to bypass TypeScript error
const initOptions = {
    resources,
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false,
    },
    compatibilityJSON: 'v4' as 'v4', // Changed to v4 for better pluralization
    react: {
        useSuspense: false,
    },
    debug: process.env.NODE_ENV === 'development',
    // Add these options for better pluralization
    pluralSeparator: '_',
    keySeparator: '.',
};

i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init(initOptions as any); // Use 'as any' to bypass TypeScript

export default i18n;
