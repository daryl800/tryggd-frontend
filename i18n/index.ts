// i18n/index.ts - WITH TYPE ASSERTION
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
    en: { translation: require('./locales/en.json') },
    sv: { translation: require('./locales/sv.json') },
    no: { translation: require('./locales/no.json') },
    da: { translation: require('./locales/da.json') },
    fi: { translation: require('./locales/fi.json') },
    'zh-Hans': { translation: require('./locales/zh-Hans.json') },
    'zh-Hant': { translation: require('./locales/zh-Hant.json') },
};

const languageDetector = {
    type: 'languageDetector' as const,
    async: true,
    detect: async (callback: (lang: string) => void) => {
        try {
            const savedLanguage = await AsyncStorage.getItem('@app_language');
            if (savedLanguage) {
                callback(savedLanguage);
                return;
            }
            callback('en');
        } catch (error) {
            callback('en');
        }
    },
    init: () => { },
    cacheUserLanguage: async (language: string) => {
        try {
            await AsyncStorage.setItem('@app_language', language);
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
    compatibilityJSON: 'v3' as 'v3', // Type assertion
    react: {
        useSuspense: false,
    },
    debug: process.env.NODE_ENV === 'development',
};

i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init(initOptions as any); // Use 'as any' to bypass TypeScript

export default i18n;