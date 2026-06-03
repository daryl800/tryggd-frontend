export type UserPlan = 'free' | 'plus';

export type UserCapabilities = {
  canUseWelfareGreeting: boolean;
  canShareLocation: boolean;
  canUseWellnessSlider: boolean;
  canControlCheckinRecipients: boolean;
  canAddUnlimitedContacts: boolean;
  maxContacts: number;
};

export function getCapabilities(plan: UserPlan): UserCapabilities {
  const isPlus = plan === 'plus';

  return {
    canUseWelfareGreeting: isPlus,
    canShareLocation: isPlus,
    canUseWellnessSlider: isPlus,
    canControlCheckinRecipients: isPlus,
    canAddUnlimitedContacts: isPlus,
    maxContacts: isPlus ? 999 : 3,
  };
}
