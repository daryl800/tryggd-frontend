import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_STORAGE_KEY = '@onboarding_completed_v1';

export async function hasCompletedOnboarding() {
  const value = await AsyncStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY);
  return value === 'true';
}

export async function completeOnboarding() {
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, 'true');
}

export async function resetOnboarding() {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETED_STORAGE_KEY);
}
