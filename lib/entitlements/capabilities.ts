export type UserPlan = 'free' | 'plus';

export const FREE_CONTACT_LIMIT = 5;
export const PLUS_CONTACT_LIMIT = 999;
export const FREE_WATCH_OVER_LIMIT = 1;

// Set to false to ship the toggle without enforcing the free-tier cap
export const WATCH_OVER_LIMIT_ENFORCED = true;

export type UserCapabilities = {
  isPlus: boolean;
  canUseWelfareGreeting: boolean;
  canShareLocation: boolean;
  canUseWellnessSlider: boolean;
  canUseTripMode: boolean;
  canControlCheckinRecipients: boolean;
  canAddUnlimitedContacts: boolean;
  canSendEmergencyMessage: boolean;
  canUseWatchOver: boolean;
  maxContacts: number;
  maxWatchOver: number;
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
    canUseWatchOver: true,
    maxContacts: contactLimit ?? (isPlus ? PLUS_CONTACT_LIMIT : FREE_CONTACT_LIMIT),
    maxWatchOver: isPlus ? PLUS_CONTACT_LIMIT : FREE_WATCH_OVER_LIMIT,
  };
}
