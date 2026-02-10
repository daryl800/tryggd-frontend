// i18n/types.ts - SIMPLE VERSION
export type TranslationKeys = string;

declare module 'i18next' {
    interface CustomTypeOptions {
        resources: {
            translation: TranslationKeys;
        };
    }
}