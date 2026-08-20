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
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SendState = 'idle' | 'sending' | 'success' | 'error';
const SUCCESS_DISPLAY_MS = 2500;

type Props = {
  userId: string;
  // Fired after a successful send with the request type and the SERVER's
  // created_at (from the send-help-request edge function's response, not a
  // client-side guess) — lets the parent screen push an updated widget
  // snapshot with the authoritative timestamp for `money_transfer_help`
  // sends, without this screen needing to know anything about widgets.
  onRequestSent?: (type: HelpRequestType, createdAt: string) => void;
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
      const result = await sendHelpRequest(type);
      setSendState('success');
      // "call_me_now" keeps its existing brief auto-dismissing toast — that
      // flow is explicitly out of scope. "money_transfer_help" instead gets
      // a full-screen state (rendered below) that stays up until the user
      // taps "Back to Tryggd" themselves; it should NOT auto-dismiss, so we
      // deliberately skip the showSuccess() fade-out timer for that type.
      if (type === 'call_me_now') {
        showSuccess();
      }
      // Defer non-visual updates so they don't re-render during the fade-in
      setTimeout(() => {
        loadLastRequests();
        onRequestSent?.(type, result.created_at);
      }, 250);
    } catch (err) {
      console.error('Help request failed:', err);
      setSendState('error');
    }
  }, [sendState, showSuccess, loadLastRequests, onRequestSent]);

  const handleRetry = useCallback(() => {
    if (activeType) handleSend(activeType);
  }, [activeType, handleSend]);

  // Dismiss the money-alert post-screen — the ONLY way it closes. No
  // auto-timer, no tap-anywhere-to-dismiss; the user has to deliberately
  // choose to leave the pause screen.
  const handleBackToTryggd = useCallback(() => {
    setSendState('idle');
  }, []);

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
          <Text style={styles.buttonTimestamp}>
            {t('home.help.lastReportTimeLabel' as any) as string} {(lastCallRequest && formatRelativeTime(lastCallRequest.created_at, t)) || '--:--'}
          </Text>
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
          <Text style={styles.buttonTimestamp}>
            {t('home.help.lastReportTimeLabel' as any) as string} {(lastMoneyRequest && formatRelativeTime(lastMoneyRequest.created_at, t)) || '--:--'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── DISCLAIMER ── */}
      <View style={styles.disclaimerBox}>
        <Ionicons name="bulb-outline" size={16} color={BaseColors.warning} style={styles.disclaimerIcon} />
        <Text style={styles.disclaimer}>{t('home.help.disclaimer' as any) as string}</Text>
      </View>

      {/* ── SUCCESS POPUP (call_me_now only) — floats over the card content.
          The money-alert flow uses the full-screen Modal below instead. ── */}
      {isSuccess && activeType === 'call_me_now' ? (
        <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={48} color="#fff" />
          <Text style={styles.successText}>{t('home.help.successBanner' as any) as string}</Text>
        </Animated.View>
      ) : null}

      {/* ── MONEY ALERT SENT — full-screen "pause" state. Replaces the
          brief toast for this flow specifically: the user may be mid-call
          with a scammer or otherwise under pressure, so this stays on
          screen until they deliberately dismiss it, rather than fading
          away on its own after a couple of seconds. ── */}
      <Modal
        visible={isSuccess && activeType === 'money_transfer_help'}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleBackToTryggd}
      >
        <SafeAreaView
          style={styles.moneyAlertScreen}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
        >
          <View style={styles.moneyAlertContent}>
            <View style={styles.moneyAlertIconBadge}>
              <Ionicons name="checkmark" size={56} color="#FFFFFF" />
            </View>
            {/* Reading order matches visual order: sent -> pause -> wait ->
                caution. No extra label overrides — a screen reader hearing
                these four lines in sequence already gives the short,
                unambiguous message this screen needs to convey. */}
            <Text style={styles.moneyAlertTitle} accessibilityRole="header">
              {t('home.help.moneyAlertSentTitle' as any) as string}
            </Text>
            <Text style={styles.moneyAlertPauseTitle}>
              {t('home.help.moneyAlertPauseTitle' as any) as string}
            </Text>
            <Text style={styles.moneyAlertBody}>
              {t('home.help.moneyAlertWaitBody' as any) as string}
            </Text>
            <View style={styles.moneyAlertCautionBox}>
              <Text style={styles.moneyAlertCautionText}>
                {t('home.help.moneyAlertCautionBody' as any) as string}
              </Text>
            </View>
          </View>

          {/* Deliberately subtle and low on the screen — this is the ONLY
              way to dismiss, and it's not meant to look like a "Continue"
              CTA the user reflexively taps to make the message go away. */}
          <TouchableOpacity
            style={styles.backToTryggdButton}
            onPress={handleBackToTryggd}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('home.help.backToTryggd' as any) as string}
          >
            <Ionicons name="chevron-back" size={18} color={BaseColors.text.muted} />
            <Text style={styles.backToTryggdText}>{t('home.help.backToTryggd' as any) as string}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// Returns null once a request is more than 24 hours old — this timestamp is
// meant to answer "was this recent?", not to track history indefinitely, so
// anything past a day falls back to the "--:--" placeholder instead of
// counting up in days.
function formatRelativeTime(isoString: string, t: any): string | null {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return t('home.status.justNow');
  if (diffMinutes < 60) return t('home.status.minutesAgo', { count: diffMinutes });

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return t('home.status.hoursAgo', { count: diffHours });

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 16,
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
    gap: 14,
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

  // ── Money alert "pause" screen ──────────────────────────────────────────
  // A calm, quiet full-screen state — soft mint wash rather than the urgent
  // red of the button that triggered it, deliberately far from anything
  // alarming. Content is centered and short; the dismiss control sits low
  // and separate so it doesn't read as "step 2 of the instruction."
  moneyAlertScreen: {
    flex: 1,
    backgroundColor: BaseColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingBottom: 12,
  },
  moneyAlertContent: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  moneyAlertIconBadge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: BaseColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  moneyAlertTitle: {
    fontSize: iosFontSize(26),
    lineHeight: iosFontSize(32),
    fontWeight: '800',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },
  moneyAlertPauseTitle: {
    fontSize: iosFontSize(20),
    lineHeight: iosFontSize(26),
    fontWeight: '700',
    color: BaseColors.primaryDark,
    textAlign: 'center',
    marginTop: -6,
  },
  moneyAlertBody: {
    fontSize: iosFontSize(17),
    lineHeight: iosFontSize(24),
    fontWeight: '500',
    color: BaseColors.text.dark,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  moneyAlertCautionBox: {
    width: '100%',
    backgroundColor: BaseColors.warningLight,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  moneyAlertCautionText: {
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(21),
    fontWeight: '700',
    color: BaseColors.text.dark,
    textAlign: 'center',
  },
  // Subtle, secondary — generous touch target (44pt+) for accessibility
  // without looking like the primary action on the screen.
  backToTryggdButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backToTryggdText: {
    fontSize: iosFontSize(15),
    fontWeight: '600',
    color: BaseColors.text.muted,
  },

});
