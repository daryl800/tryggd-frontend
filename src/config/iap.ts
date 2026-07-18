import { Platform } from 'react-native';

export const IAP_PRODUCT_IDS = {
  monthly: 'tryggd_plus_monthly',
  annual: 'tryggd_plus_annual',
} as const;

export type IAPProductKey = keyof typeof IAP_PRODUCT_IDS;

// Flat list for fetching from store — same IDs on both platforms
export const ALL_PRODUCT_IDS = Object.values(IAP_PRODUCT_IDS);

export const PLATFORM: 'ios' | 'android' =
  Platform.OS === 'ios' ? 'ios' : 'android';
