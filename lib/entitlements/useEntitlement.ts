import { useAuth } from '@/contexts/AuthContext';

export type PlanSource = 'free' | 'pilot_preview' | 'paid_plus';

export type EntitlementState = {
  isPlusPreviewEnabled: boolean;
  isPlusPreviewOpen: boolean;
  hasActivatedPilotPreview: boolean;
  hasPilotPreviewAccess: boolean;
  hasPaidPlusAccess: boolean;
  hasPlusAccess: boolean;
  isPilotPreviewExpired: boolean;
  planSource: PlanSource;
  campaignId: string | null;
  pilotPreviewEndsAt: Date | null;
};

export function useEntitlement(): EntitlementState {
  const { plan, profile, pilotPreviewConfig } = useAuth();

  const isPlusPreviewEnabled = pilotPreviewConfig?.pilot_preview_enabled === true;
  const isPlusPreviewOpen =
    isPlusPreviewEnabled &&
    !!pilotPreviewConfig?.pilot_preview_ends_at &&
    new Date(pilotPreviewConfig.pilot_preview_ends_at) > new Date();

  const hasActivatedPilotPreview = !!profile?.pilot_preview_activated_at;
  const hasPilotPreviewAccess = isPlusPreviewOpen && hasActivatedPilotPreview;
  const hasPaidPlusAccess = plan === 'plus' && !hasPilotPreviewAccess;
  const hasPlusAccess = hasPaidPlusAccess || hasPilotPreviewAccess;

  // True when the user activated the preview but the campaign deadline has now passed
  const isPilotPreviewExpired =
    hasActivatedPilotPreview &&
    isPlusPreviewEnabled &&
    !!pilotPreviewConfig?.pilot_preview_ends_at &&
    !isPlusPreviewOpen;

  const planSource: PlanSource = hasPaidPlusAccess
    ? 'paid_plus'
    : hasPilotPreviewAccess
    ? 'pilot_preview'
    : 'free';

  const campaignId = pilotPreviewConfig?.pilot_preview_campaign_id ?? null;
  const pilotPreviewEndsAt = pilotPreviewConfig?.pilot_preview_ends_at
    ? new Date(pilotPreviewConfig.pilot_preview_ends_at)
    : null;

  return {
    isPlusPreviewEnabled,
    isPlusPreviewOpen,
    hasActivatedPilotPreview,
    hasPilotPreviewAccess,
    hasPaidPlusAccess,
    hasPlusAccess,
    isPilotPreviewExpired,
    planSource,
    campaignId,
    pilotPreviewEndsAt,
  };
}
