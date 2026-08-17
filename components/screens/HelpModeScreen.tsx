// components/screens/HelpModeScreen.tsx
import { BaseColors } from '@/constants/colors';
import { SCREEN_PADDING } from '@/constants/spacing';
import { iosFontSize } from '@/constants/typography';
import { fetchLastHelpRequestByType, HelpRequest, HelpRequestType, sendHelpRequest } from '@/lib/api/helpRequest';
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
  // Tracked per type, not as one shared "last request" — a user can press
  // both buttons within a short window, and each needs its own timestamp
  // rather than one line hiding whichever button wasn't pressed last.
  const [lastCallRequest, setLastCallRequest] = useState<HelpRequest | null>(null);
  const [lastMoneyRequest, setLastMoneyRequest] = useState<HelpRequest | null>(null);
  const [activeType, setActiveType] = useState<HelpRequestType | null>(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLastRequests = useCallback(async () => {
    try {
      const [call, money] = await Promise.all([
        fetchLastHelpRequestByType(userId, 'call_me_now'),
        fetchLastHelpRequestByType(userId, 'money_transfer_help'),
      ]);
      setLastCallRequest(call);
      setLastMoneyRequest(money);
    } catch {
      // non-critical
    }
  }, [userId]);

  useEffect(() => {
    loadLastRequests();
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [loadLastRequests]);

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
        loadLastRequests();
        onRequestSent?.();
      }, 250);
    } catch (err) {
      console.error('Help request failed:', err);
      setSendState('error');
    }
  }, [sendState, showSuccess, loadLastRequests, onRequestSent]);

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

      {/* ── CALM REMINDER ── */}
      <View style={styles.panicReminderPill}>
        <Text style={styles.panicReminderText}>{t('home.help.dontPanicLine' as any) as string}</Text>
      </View>

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
          <View style={styles.iconBadge}>
            <Text style={styles.buttonIcon}>✋</Text>
          </View>
          <Text style={styles.buttonLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{t('home.help.callMeNowLabel' as any) as string}</Text>
          {lastCallRequest && (
            <Text style={styles.buttonTimestamp}>{formatRelativeTime(lastCallRequest.created_at, t)}</Text>
          )}
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
            <View style={styles.iconBadge}>
              <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.iconBadge}>
              <Ionicons name="call-outline" size={18} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.buttonLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{t('home.help.moneyHelpLabel' as any) as string}</Text>
          {lastMoneyRequest && (
            <Text style={styles.buttonTimestamp}>{formatRelativeTime(lastMoneyRequest.created_at, t)}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── DISCLAIMER ── */}
      <View style={styles.disclaimerBox}>
        <Ionicons name="bulb-outline" size={16} color={BaseColors.warning} style={styles.disclaimerIcon} />
        <Text style={styles.disclaimer}>{t('home.help.disclaimer' as any) as string}</Text>
      </View>

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
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
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

  // Calm reminder — sits above the buttons, emotional reassurance rather
  // than navigational context (the Help tab itself already establishes
  // where you are). Boxed in its own frosted pill, same language as the
  // cards on the main screen — this section sits on the same photo/gradient
  // background, so plain text here isn't guaranteed enough contrast on its
  // own (this is what was nearly invisible before).
  panicReminderPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 17,
  },
  panicReminderText: {
    fontSize: iosFontSize(15),
    fontWeight: '700',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },

  // Action buttons — sized to keep the whole screen fitting in one
  // viewport (header + tabs + reminder + both buttons + disclaimer). The
  // font is the big/bold part; the button itself doesn't need much extra
  // padding around that to read as "large."
  buttonRow: {
    flexDirection: 'column',
    gap: 10,
  },
  actionButton: {
    minHeight: 128,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
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
    gap: 8,
  },
  // Circular badge behind each icon — same treatment on both buttons.
  // Uses real vector icons (Ionicons), not native emoji, so the icon color
  // is actually controllable — a plain emoji glyph can't be recolored white.
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    fontSize: 22,
    lineHeight: 27,
  },
  buttonLabel: {
    fontSize: Platform.OS === 'android' ? 21 : iosFontSize(25),
    lineHeight: Platform.OS === 'android' ? 26 : iosFontSize(30),
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
    alignSelf: 'stretch',
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  // Per-button last-sent time — small and quiet, sits under the label
  // inside the button itself.
  buttonTimestamp: {
    fontSize: iosFontSize(12),
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textAlign: 'center',
  },
  // Disclaimer — boxed so the full safety copy stays scannable at a glance
  // instead of reading as a dense line of small text.
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: BaseColors.warningLight,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  disclaimerIcon: {
    marginTop: 1,
  },
  disclaimer: {
    flex: 1,
    fontSize: iosFontSize(12),
    lineHeight: iosFontSize(17),
    color: BaseColors.text.dark,
  },

});
