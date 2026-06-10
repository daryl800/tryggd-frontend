export type UserPlan = 'free' | 'plus';

export type UserCapabilities = {
  isPlus: boolean;
  canUseWelfareGreeting: boolean;
  canShareLocation: boolean;
  canUseWellnessSlider: boolean;
  canControlCheckinRecipients: boolean;
  canAddUnlimitedContacts: boolean;
  maxContacts: number;
};

export function getCapabilities(plan: UserPlan, contactLimit?: number): UserCapabilities {
  const isPlus = plan === 'plus';

  return {
    isPlus,
    canUseWelfareGreeting: true,
    canShareLocation: isPlus,
    canUseWellnessSlider: isPlus,
    canControlCheckinRecipients: isPlus,
    canAddUnlimitedContacts: isPlus,
    maxContacts: contactLimit ?? (isPlus ? 999 : 3),
  };
}
