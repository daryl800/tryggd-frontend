export type UserPlan = 'free' | 'plus';

export const FREE_CONTACT_LIMIT = 5;
export const PLUS_CONTACT_LIMIT = 999;

export type UserCapabilities = {
  isPlus: boolean;
  canUseWelfareGreeting: boolean;
  canShareLocation: boolean;
  canUseWellnessSlider: boolean;
  canUseTripMode: boolean;
  canControlCheckinRecipients: boolean;
  canAddUnlimitedContacts: boolean;
  canSendEmergencyMessage: boolean;
  maxContacts: number;
};

export function getCapabilities(plan: UserPlan, contactLimit?: number): UserCapabilities {
  const isPlus = plan === 'plus';

  return {
    isPlus,
    canUseWelfareGreeting: true,
    canShareLocation: isPlus,
    canUseWellnessSlider: isPlus,
    canUseTripMode: isPlus,
    canControlCheckinRecipients: isPlus,
    canAddUnlimitedContacts: isPlus,
    canSendEmergencyMessage: isPlus,
    maxContacts: contactLimit ?? (isPlus ? PLUS_CONTACT_LIMIT : FREE_CONTACT_LIMIT),
  };
}
