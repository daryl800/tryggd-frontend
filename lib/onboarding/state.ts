import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_STORAGE_KEY = '@onboarding_completed_v1';

const getOnboardingCompletedKey = (userId?: string | null) =>
  userId ? `${ONBOARDING_COMPLETED_STORAGE_KEY}:${userId}` : ONBOARDING_COMPLETED_STORAGE_KEY;

export async function hasCompletedOnboarding(userId?: string | null) {
  const value = await AsyncStorage.getItem(getOnboardingCompletedKey(userId));
  return value === 'true';
}

export async function completeOnboarding(userId?: string | null) {
  await AsyncStorage.setItem(getOnboardingCompletedKey(userId), 'true');
}

export async function resetOnboarding(userId?: string | null) {
  await AsyncStorage.removeItem(getOnboardingCompletedKey(userId));
}
