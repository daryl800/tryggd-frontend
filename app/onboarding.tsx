import { Ionicons } from '@expo/vector-icons';
import { BaseColors } from '@/constants/colors';
import { iosFontSize } from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboarding } from '@/lib/onboarding/state';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SlideVariant = 'safety' | 'standard' | 'plus-preview';

type IntroSlide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  eyebrow: string;
  variant: SlideVariant;
  body?: string;
  highlights?: string[];
  footerNote?: string;
};

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user, needsUsername } = useAuth();
  const [page, setPage] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const slides = useMemo<IntroSlide[]>(
    () => [
      {
        icon: 'heart-circle',
        variant: 'standard',
        eyebrow: t('onboarding.slides.checkin.eyebrow', { defaultValue: 'Daily rhythm' }),
        title: t('onboarding.slides.checkin.title', { defaultValue: 'Quick daily check-ins' }),
        body: t('onboarding.slides.checkin.body', {
          defaultValue: '💚 Check in with one tap and let trusted contacts know you are okay.',
        }),
        highlights: [
          t('onboarding.slides.checkin.points.one', { defaultValue: '✓ One tap to check in' }),
          t('onboarding.slides.checkin.points.two', { defaultValue: '✓ A simple “I am safe” update' }),
        ],
      },
      {
        icon: 'people-circle',
        variant: 'standard',
        eyebrow: t('onboarding.slides.contacts.eyebrow', { defaultValue: 'Your circle' }),
        title: t('onboarding.slides.contacts.title', { defaultValue: 'Trusted contacts' }),
        body: t('onboarding.slides.contacts.body', {
          defaultValue: '👥 Add family or close friends who can receive your check-ins, help signals, and shared updates.',
        }),
        highlights: [
          t('onboarding.slides.contacts.points.one', { defaultValue: '✓ Choose who sees your updates' }),
          t('onboarding.slides.contacts.points.two', { defaultValue: '✓ Help signals go to the right people' }),
        ],
      },
      {
        icon: 'navigate-circle',
        variant: 'standard',
        eyebrow: t('onboarding.slides.sharing.eyebrow', { defaultValue: 'Optional context' }),
        title: t('onboarding.slides.sharing.title', { defaultValue: 'Status and location' }),
        body: t('onboarding.slides.sharing.body', {
          defaultValue: '📍 Share how you are, whether you are home or out, trip status, or location with selected contacts.',
        }),
        highlights: [
          t('onboarding.slides.sharing.points.one', { defaultValue: '✓ 🙂 Mood, 🏠 home/away, or ✈️ trip status' }),
          t('onboarding.slides.sharing.points.two', { defaultValue: '✓ 📍 Location only when you choose to share it' }),
        ],
      },
      {
        icon: 'leaf',
        variant: 'plus-preview',
        eyebrow: t('onboarding.slides.free.eyebrow', { defaultValue: 'Simple by default' }),
        title: t('onboarding.slides.free.title', { defaultValue: 'Plus Preview' }),
        body: t('onboarding.slides.free.body', {
          defaultValue: 'Tryggd Free keeps the basics simple. During the pilot, you can preview Plus features:',
        }),
        highlights: [
          t('onboarding.slides.free.points.one', { defaultValue: '✈️ Trip Mode' }),
          t('onboarding.slides.free.points.two', { defaultValue: '📍 Location sharing options' }),
          t('onboarding.slides.free.points.three', { defaultValue: '🙂 Mood updates' }),
          t('onboarding.slides.free.points.four', { defaultValue: '⚙️ More sharing control' }),
        ],
      },
      {
        icon: 'shield-checkmark',
        variant: 'safety',
        eyebrow: t('onboarding.disclaimer.eyebrow', { defaultValue: 'Good to know' }),
        title: t('onboarding.disclaimer.title', { defaultValue: 'A few important notes' }),
      },
    ],
    [t],
  );

  const activeSlide = slides[page];
  const isSafetyPage = activeSlide.variant === 'safety';
  const isFinalPage = page === slides.length - 1;

  const finish = async () => {
    if (saving || !accepted) return;

    setSaving(true);
    try {
      await completeOnboarding(user?.id);

      router.replace(user ? (needsUsername ? '/complete-profile' : '/') : '/(auth)/login');
    } catch (error: any) {
      Alert.alert(
        t('onboarding.errors.saveTitle', { defaultValue: 'Unable to continue' }),
        error?.message || t('onboarding.errors.saveBody', { defaultValue: 'Please try again.' }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setPage(slides.length - 1);
  };

  const handleDecline = async () => {
    if (user) {
      await supabase.auth.signOut();
    }
    router.replace('/(auth)/login');
  };

  const handleNext = () => {
    if (isSafetyPage && !accepted) return;
    if (isFinalPage) {
      void finish();
      return;
    }
    setPage((current) => Math.min(current + 1, slides.length - 1));
  };

  const renderPlusPreviewBody = () => (
    <View style={styles.plusPreviewBodyWrap}>
      <Text style={styles.plusPreviewFreeSummary}>
        {t('onboarding.slides.free.freeSummary', {
          defaultValue: 'Free: check-in, trusted contacts, basic status',
        })}
      </Text>
      <Text style={[styles.subtitle, styles.plusPreviewBodySecondary]}>
        {t('onboarding.slides.free.bodyPilotPrefix', {
          defaultValue: 'During the pilot, preview ',
        })}
        <Text style={styles.plusPreviewStrong}>Plus</Text>
        {t('onboarding.slides.free.bodyPilotSuffix', {
          defaultValue: ':',
        })}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        {!isFinalPage ? (
          <Pressable onPress={handleSkip} hitSlop={12}>
            <Text style={styles.skipText}>
              {t('onboarding.skip', { defaultValue: 'Skip' })}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.heroPanel}>
          <View style={styles.heroIconWrap}>
            <View style={styles.heroIconHalo}>
              <Ionicons
                name={activeSlide.icon}
                size={28}
                color={BaseColors.primary}
              />
            </View>
          </View>

          <Text style={styles.eyebrow}>{activeSlide.eyebrow}</Text>
          <Text style={styles.title}>{activeSlide.title}</Text>

          {isSafetyPage ? (
            <>
              <View style={styles.disclaimerCard}>
                <Text style={styles.disclaimerParagraph}>
                  <Text style={styles.disclaimerStrong}>
                    {t('onboarding.disclaimer.productName', { defaultValue: 'Tryggd ' })}
                  </Text>
                  <Text>
                    {t('onboarding.disclaimer.paragraph1', {
                      defaultValue: 'helps you share manual check-ins, help signals, and selected updates with trusted contacts.',
                    })}
                  </Text>
                </Text>
                <Text style={styles.disclaimerParagraph}>
                  {t('onboarding.disclaimer.paragraph2', {
                    defaultValue: 'Your contacts may see the status updates you choose to share. Location is only shared when you turn location sharing on.',
                  })}
                </Text>
                <Text style={styles.disclaimerParagraph}>
                  {t('onboarding.disclaimer.paragraph3', {
                    defaultValue: 'Notifications may be delayed because of network connection, battery level, device settings, or third-party push services.',
                  })}
                </Text>
                <Text style={[styles.disclaimerParagraph, styles.disclaimerParagraphLast]}>
                  {t('onboarding.disclaimer.paragraph4', {
                    defaultValue: 'Tryggd is not an emergency service and should not be relied on in urgent or life-threatening situations.',
                  })}
                </Text>
              </View>

              <View style={styles.acceptRow}>
                <Text style={styles.acceptText}>
                  {t('onboarding.disclaimer.acceptLabel', {
                    defaultValue: 'I understand',
                  })}
                </Text>
                <Switch
                  value={accepted}
                  onValueChange={setAccepted}
                  trackColor={{ false: '#D6DCE5', true: '#B7E3C7' }}
                  thumbColor={accepted ? '#5FA893' : '#FFFFFF'}
                  ios_backgroundColor="#D6DCE5"
                />
              </View>
            </>
          ) : (
            <>
              {activeSlide.variant === 'plus-preview'
                ? renderPlusPreviewBody()
                : activeSlide.body
                ? <Text style={styles.subtitle}>{activeSlide.body}</Text>
                : null}

              {activeSlide.highlights?.length ? (
                <View style={[styles.highlightsWrap, activeSlide.variant === 'plus-preview' && styles.plusHighlightsWrap]}>
                  {activeSlide.highlights.map((item) => (
                    <View key={item} style={[styles.highlightPill, activeSlide.variant === 'plus-preview' && styles.plusHighlightPill]}>
                      <Ionicons
                        name={activeSlide.variant === 'plus-preview' ? 'sparkles' : 'checkmark-circle'}
                        size={16}
                        color={BaseColors.primary}
                      />
                      <Text style={styles.highlightText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {activeSlide.footerNote ? (
                <Text style={styles.footerNote}>{activeSlide.footerNote}</Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => setPage(index)}
              hitSlop={10}
              style={styles.dotPressable}
            >
              <View style={[styles.dot, index === page && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleNext}
          disabled={saving || (isSafetyPage && !accepted)}
          style={[styles.primaryButton, (saving || (isSafetyPage && !accepted)) && styles.primaryButtonDisabled]}
        >
          <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>
                  {saving
                    ? t('onboarding.disclaimer.saving', { defaultValue: 'Saving...' })
                    : isFinalPage
                    ? t('onboarding.getStarted', { defaultValue: 'Get started' })
                    : t('onboarding.next', { defaultValue: 'Next' })}
                </Text>
            {!saving ? <Ionicons name="chevron-forward" size={18} color="#FFFFFF" /> : null}
          </View>
        </TouchableOpacity>

        {isSafetyPage ? (
          <Pressable onPress={handleDecline} style={styles.secondaryAction}>
            <Text style={styles.secondaryActionText}>
              {t('onboarding.disclaimer.decline', { defaultValue: 'Decline / Back' })}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  topBar: {
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skipText: {
    color: BaseColors.primary,
    fontSize: iosFontSize(16),
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  heroPanel: {
    backgroundColor: BaseColors.surface,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroIconWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconHalo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BaseColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    textAlign: 'center',
    color: BaseColors.text.muted,
    fontSize: iosFontSize(13),
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  title: {
    textAlign: 'center',
    color: BaseColors.text.dark,
    fontSize: iosFontSize(30),
    fontWeight: '800',
    marginBottom: 14,
  },
  subtitle: {
    textAlign: 'center',
    color: BaseColors.neutral[500],
    fontSize: iosFontSize(17),
    lineHeight: 25,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  plusPreviewBodyWrap: {
    marginBottom: 14,
  },
  plusPreviewFreeSummary: {
    textAlign: 'center',
    color: BaseColors.neutral[600],
    fontSize: iosFontSize(14),
    lineHeight: 20,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  plusPreviewBodySecondary: {
    marginBottom: 0,
  },
  plusPreviewStrong: {
    color: BaseColors.text.dark,
    fontWeight: '800',
  },
  highlightsWrap: {
    gap: 10,
  },
  plusHighlightsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  highlightPill: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  plusHighlightPill: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  highlightText: {
    flex: 1,
    color: BaseColors.text.dark,
    fontSize: iosFontSize(15),
    fontWeight: '600',
  },
  footerNote: {
    textAlign: 'center',
    color: BaseColors.primaryDark,
    fontSize: iosFontSize(15),
    fontWeight: '700',
    marginTop: 16,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 22,
  },
  dotPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 16,
    minHeight: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BaseColors.neutral[300],
  },
  dotActive: {
    width: 24,
    backgroundColor: BaseColors.primary,
  },
  disclaimerCard: {
    backgroundColor: BaseColors.primaryLight,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
  },
  disclaimerParagraph: {
    color: BaseColors.neutral[700],
    fontSize: iosFontSize(15),
    lineHeight: 22,
    marginBottom: 10,
  },
  disclaimerParagraphLast: {
    marginBottom: 0,
  },
  disclaimerStrong: {
    color: BaseColors.text.dark,
    fontWeight: '800',
  },
  acceptRow: {
    backgroundColor: BaseColors.surface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
  },
  acceptText: {
    color: BaseColors.text.dark,
    fontSize: iosFontSize(17),
    fontWeight: '700',
    flex: 1,
    paddingRight: 16,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BaseColors.primary,
    borderRadius: 18,
    minHeight: 58,
    marginBottom: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: '#A8C8BC',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: iosFontSize(18),
    fontWeight: '800',
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryActionText: {
    color: BaseColors.neutral[600],
    fontSize: iosFontSize(16),
    fontWeight: '600',
  },
});
