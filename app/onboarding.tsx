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

type IntroSlide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  eyebrow: string;
  highlights?: string[];
  checklist?: string[];
};

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { user, needsUsername } = useAuth();
  const [page, setPage] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const slides = useMemo<IntroSlide[]>(() => [
    {
      icon: 'heart-circle',
      eyebrow: t('onboarding.slides.checkin.eyebrow', { defaultValue: 'Daily rhythm' }),
      title: t('onboarding.slides.checkin.title', { defaultValue: 'Quick daily check-ins' }),
      body: t('onboarding.slides.checkin.body', {
        defaultValue: '💚 Check in with one tap and let trusted contacts know you are okay.',
      }),
      highlights: [
        t('onboarding.slides.checkin.points.one', { defaultValue: '⭕ One-tap check-in button' }),
        t('onboarding.slides.checkin.points.two', { defaultValue: '✅ A simple “I am safe” update' }),
      ],
    },
    {
      icon: 'people-circle',
      eyebrow: t('onboarding.slides.contacts.eyebrow', { defaultValue: 'Your circle' }),
      title: t('onboarding.slides.contacts.title', { defaultValue: 'Trusted contacts' }),
      body: t('onboarding.slides.contacts.body', {
        defaultValue: '👥 Add family or close friends to receive your check-ins, help signals, and shared updates.',
      }),
      highlights: [
        t('onboarding.slides.contacts.points.one', { defaultValue: '👥 Choose who sees your updates' }),
        t('onboarding.slides.contacts.points.two', { defaultValue: '✋ Help signals go to the right people' }),
      ],
    },
    {
      icon: 'navigate-circle',
      eyebrow: t('onboarding.slides.sharing.eyebrow', { defaultValue: 'Optional context' }),
      title: t('onboarding.slides.sharing.title', { defaultValue: 'Status and location' }),
      body: t('onboarding.slides.sharing.body', {
        defaultValue: '📍 Optionally share mood, presence, trip status, or location with selected contacts.',
      }),
      highlights: [
        t('onboarding.slides.sharing.points.one', { defaultValue: '🙂 Mood, 🏠 presence, or ✈️ trip status' }),
        t('onboarding.slides.sharing.points.two', { defaultValue: '📍 Location only when you choose to share it' }),
      ],
    },
    {
      icon: 'shield-checkmark',
      eyebrow: t('onboarding.slides.ready.eyebrow', { defaultValue: 'Setup path' }),
      title: t('onboarding.slides.ready.title', { defaultValue: 'Ready to start' }),
      body: t('onboarding.slides.ready.body', {
        defaultValue: '🛠️ Complete these quick steps to set up Tryggd clearly and safely.',
      }),
      checklist: [
        t('onboarding.slides.ready.items.profile', { defaultValue: 'Set your profile' }),
        t('onboarding.slides.ready.items.contacts', { defaultValue: 'Add trusted contacts' }),
        t('onboarding.slides.ready.items.notifications', { defaultValue: 'Enable notifications' }),
      ],
    },
  ], [t]);

  const isDisclaimerPage = page === slides.length;
  const activeSlide = slides[Math.min(page, slides.length - 1)];

  const finish = async () => {
    if (saving || !accepted) return;

    setSaving(true);
    try {
      await completeOnboarding();
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
    setPage(slides.length);
  };

  const handleDecline = async () => {
    if (user) {
      await supabase.auth.signOut();
    }
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        {!isDisclaimerPage ? (
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
        {!isDisclaimerPage ? (
          <>
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
              <Text style={styles.subtitle}>{activeSlide.body}</Text>

              {activeSlide.highlights?.length ? (
                <View style={styles.highlightsWrap}>
                  {activeSlide.highlights.map((item) => (
                    <View key={item} style={styles.highlightPill}>
                      <Ionicons name="checkmark-circle" size={16} color={BaseColors.primary} />
                      <Text style={styles.highlightText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {activeSlide.checklist?.length ? (
              <View style={styles.checklistWrap}>
                {activeSlide.checklist.map((item, index) => (
                  <View key={item} style={styles.checklistCard}>
                    <View style={styles.checklistIcon}>
                      <Ionicons
                        name={index === 0 ? 'person' : index === 1 ? 'people' : 'notifications'}
                        size={18}
                        color="#5FA893"
                      />
                    </View>
                    <Text style={styles.checklistText}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.pagination}>
              {Array.from({ length: slides.length + 1 }).map((_, index) => (
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
              onPress={() => setPage((current) => Math.min(current + 1, slides.length))}
              style={styles.primaryButton}
            >
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>
                  {page === slides.length - 1
                    ? t('onboarding.getStarted', { defaultValue: 'Review disclaimer' })
                    : t('onboarding.next', { defaultValue: 'Next' })}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.heroIconWrap}>
              <View style={styles.heroIconHalo}>
                <Ionicons
                  name="shield-checkmark"
                  size={28}
                  color={BaseColors.primary}
                />
              </View>
            </View>
            <Text style={styles.eyebrow}>
              {t('onboarding.disclaimer.eyebrow', { defaultValue: 'Safety notice' })}
            </Text>
            <Text style={styles.title}>
              {t('onboarding.disclaimer.title', { defaultValue: 'Important before you continue' })}
            </Text>
            <Text style={styles.subtitle}>
              {t('onboarding.disclaimer.subtitle', {
                defaultValue: 'Please read this carefully before using Tryggd.',
              })}
            </Text>

            <View style={styles.disclaimerCard}>
              <Text style={styles.disclaimerText}>
                <Text style={styles.disclaimerStrong}>
                  {t('onboarding.disclaimer.productName', { defaultValue: 'Tryggd ' })}
                </Text>
                <Text>
                  {t('onboarding.disclaimer.body', {
                    defaultValue:
                      'helps you share manual check-ins, help signals, and recent check-in activity with selected contacts. Any status or location you choose to share may be visible to those contacts. Notification delivery depends on network connection, battery level, device settings, and third-party push services. Tryggd is not an emergency service and should not be relied on in urgent or life-threatening situations.',
                  })}
                </Text>
              </Text>
            </View>

            <View style={styles.acceptRow}>
              <Text style={styles.acceptText}>
                {t('onboarding.disclaimer.acceptLabel', {
                  defaultValue: 'I understand and accept',
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

            <TouchableOpacity
              onPress={finish}
              disabled={!accepted || saving}
              style={[styles.primaryButton, (!accepted || saving) && styles.primaryButtonDisabled]}
            >
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>
                  {saving
                    ? t('onboarding.disclaimer.saving', { defaultValue: 'Saving...' })
                    : t('onboarding.disclaimer.acceptAndContinue', { defaultValue: 'Accept & Continue' })}
                </Text>
                {!saving ? <Ionicons name="chevron-forward" size={18} color="#FFFFFF" /> : null}
              </View>
            </TouchableOpacity>

            <Pressable onPress={handleDecline} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>
                {t('onboarding.disclaimer.decline', { defaultValue: 'Decline / Back' })}
              </Text>
            </Pressable>

            <View style={styles.pagination}>
              {Array.from({ length: slides.length + 1 }).map((_, index) => (
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
          </>
        )}
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
    paddingTop: 24,
    paddingBottom: 26,
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
    marginBottom: 18,
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
    lineHeight: 26,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  highlightsWrap: {
    gap: 10,
  },
  highlightPill: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: BaseColors.primaryLight,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  highlightText: {
    flex: 1,
    color: BaseColors.text.dark,
    fontSize: iosFontSize(15),
    fontWeight: '600',
  },
  checklistWrap: {
    gap: 14,
    marginBottom: 28,
  },
  checklistCard: {
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: BaseColors.surface,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  checklistIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BaseColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checklistText: {
    flex: 1,
    color: BaseColors.text.dark,
    fontSize: iosFontSize(18),
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 26,
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
    backgroundColor: BaseColors.surface,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  disclaimerText: {
    color: BaseColors.neutral[700],
    fontSize: iosFontSize(17),
    lineHeight: 28,
  },
  disclaimerStrong: {
    color: BaseColors.text.dark,
    fontWeight: '800',
  },
  acceptRow: {
    backgroundColor: BaseColors.surface,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    shadowColor: BaseColors.shadowColor,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
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
    marginBottom: 18,
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
