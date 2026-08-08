// components/screens/HelpModeScreen.tsx
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { iosFontSize } from '@/constants/typography';
import { fetchLastHelpRequest, HelpRequest, HelpRequestType, sendHelpRequest } from '@/lib/api/helpRequest';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type SendState = 'idle' | 'sending' | 'success' | 'error';
const SUCCESS_DISPLAY_MS = 2500;

type Props = {
  userId: string;
  onRequestSent?: () => void;
};

export function HelpModeScreen({ userId, onRequestSent }: Props) {
  const { t } = useTranslation();
  const [sendState, setSendState] = useState<SendState>('idle');
  const [lastRequest, setLastRequest] = useState<HelpRequest | null>(null);
  const [activeType, setActiveType] = useState<HelpRequestType | null>(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLastRequest = useCallback(async () => {
    try {
      const req = await fetchLastHelpRequest(userId);
      setLastRequest(req);
    } catch {
      // non-critical
    }
  }, [userId]);

  useEffect(() => {
    loadLastRequest();
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [loadLastRequest]);

  const showSuccess = useCallback(() => {
    Animated.timing(successOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => {
      Animated.timing(successOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setSendState('idle'));
    }, SUCCESS_DISPLAY_MS);
  }, [successOpacity]);

  const handleSend = useCallback(async (type: HelpRequestType) => {
    if (sendState === 'sending') return;
    setActiveType(type);
    setSendState('sending');

    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await sendHelpRequest(type);
      setSendState('success');
      showSuccess();
      // Defer non-visual updates so they don't re-render during the fade-in
      setTimeout(() => {
        loadLastRequest();
        onRequestSent?.();
      }, 250);
    } catch (err) {
      console.error('Help request failed:', err);
      setSendState('error');
    }
  }, [sendState, showSuccess, loadLastRequest, onRequestSent]);

  const handleRetry = useCallback(() => {
    if (activeType) handleSend(activeType);
  }, [activeType, handleSend]);

  const isSending = sendState === 'sending';
  const isError = sendState === 'error';
  const isSuccess = sendState === 'success';

  return (
    <View style={styles.container}>
      {/* ── ERROR STATE ── */}
      {isError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{t('home.help.errorMessage' as any) as string}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('home.help.retryLabel' as any) as string}
          >
            <Text style={styles.retryButtonText}>{t('home.help.retryButton' as any) as string}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── ACTION BUTTONS ── */}
      <View style={styles.buttonRow}>
        {/* I NEED HELP */}
        <TouchableOpacity
          style={[styles.actionButton, styles.callButton, isSending && styles.buttonDisabled]}
          onPress={() => handleSend('call_me_now')}
          disabled={isSending}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('home.help.callMeNowAccessLabel' as any) as string}
          accessibilityHint={t('home.help.callMeNowAccessHint' as any) as string}
        >
          <Text style={styles.buttonIcon}>✋</Text>
          <Text style={styles.buttonLabel} numberOfLines={2} adjustsFontSizeToFit>{t('home.help.callMeNowLabel' as any) as string}</Text>
        </TouchableOpacity>

        {/* ASKED TO SEND MONEY */}
        <TouchableOpacity
          style={[styles.actionButton, styles.moneyButton, isSending && styles.buttonDisabled]}
          onPress={() => handleSend('money_transfer_help')}
          disabled={isSending}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('home.help.moneyHelpAccessLabel' as any) as string}
          accessibilityHint={t('home.help.moneyHelpAccessHint' as any) as string}
        >
          <View style={styles.moneyIconRow}>
            <Text style={styles.moneyExclamation}>!!</Text>
            <Text style={styles.buttonIcon}>💸</Text>
            <Text style={styles.moneyExclamation}>!!</Text>
          </View>
          <Text style={styles.buttonLabel}>{t('home.help.moneyHelpLabel' as any) as string}</Text>
        </TouchableOpacity>
      </View>

      {/* ── DISCLAIMER ── */}
      <Text style={styles.disclaimer}>{t('home.help.disclaimer' as any) as string}</Text>

      {/* ── LAST HELP REQUEST ── */}
      <LastRequestDisplay request={lastRequest} />

      {/* ── SUCCESS POPUP — floats over the entire card content ── */}
      {isSuccess ? (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={48} color="#fff" />
          <Text style={styles.successText}>{t('home.help.successBanner' as any) as string}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

// ── Last request display ──────────────────────────────────────────────────

function LastRequestDisplay({ request }: { request: HelpRequest | null }) {
  const { t } = useTranslation();

  const label = request
    ? request.type === 'call_me_now'
      ? t('home.help.lastRequestCall' as any) as string
      : t('home.help.lastRequestMoney' as any) as string
    : null;

  const timeLabel = request ? formatRelativeTime(request.created_at, t) : null;

  return (
    <View style={styles.lastRequestRow}>
      <Ionicons
        name={request ? 'time-outline' : 'time-outline'}
        size={14}
        color={BaseColors.neutral[400]}
      />
      <Text style={styles.lastRequestText}>
        {request && label && timeLabel
          ? `${t('home.help.lastRequestPrefix' as any) as string} ${label} · ${timeLabel}`
          : (t('home.help.noRequestsYet' as any) as string)}
      </Text>
    </View>
  );
}

function formatRelativeTime(isoString: string, t: any): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return t('home.status.justNow');
  if (diffMinutes < 60) return t('home.status.minutesAgo', { count: diffMinutes });

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return t('home.status.hoursAgo', { count: diffHours });

  // For older: show the actual time as HH:MM
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },

  // Success popup — covers the full card content area
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    borderRadius: 20,
    backgroundColor: BaseColors.success,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  successText: {
    fontSize: iosFontSize(22),
    lineHeight: iosFontSize(28),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },

  // Error
  errorBanner: {
    backgroundColor: BaseColors.errorLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BaseColors.errorBorder,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontSize: iosFontSize(16),
    lineHeight: iosFontSize(22),
    fontWeight: '700',
    color: BaseColors.error,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: BaseColors.error,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    fontSize: iosFontSize(16),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Action buttons
  buttonRow: {
    flexDirection: 'column',
    gap: 10,
  },
  actionButton: {
    minHeight: 120,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  callButton: {
    backgroundColor: '#1D4ED8',
  },
  moneyButton: {
    backgroundColor: '#DC2626',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  moneyIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moneyExclamation: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  buttonIcon: {
    fontSize: 32,
    lineHeight: 38,
  },
  buttonLabel: {
    fontSize: iosFontSize(17),
    lineHeight: iosFontSize(22),
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
    alignSelf: 'stretch',
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  // Disclaimer
  disclaimer: {
    fontSize: iosFontSize(11),
    lineHeight: iosFontSize(15),
    color: BaseColors.neutral[400],
    textAlign: 'center',
    paddingHorizontal: 4,
  },

  // Last request
  lastRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 4,
  },
  lastRequestText: {
    fontSize: iosFontSize(13),
    lineHeight: iosFontSize(18),
    color: BaseColors.neutral[400],
    fontWeight: '500',
  },
});
