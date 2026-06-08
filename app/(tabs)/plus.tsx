import { ScreenHeader } from '@/components/screens/ScreenHeader';
import { BaseColors } from '@/constants/colors';
import { UI_FEATURE_FLAGS } from '@/constants/featureFlags';
import { SCREEN_PADDING } from '@/constants/spacing';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { iosFontSize } from '@/constants/typography';

const FEATURE_ICONS = [
  { key: 'wellness', icon: 'happy-outline' as const },
  { key: 'location', icon: 'location-outline' as const },
  { key: 'notifications', icon: 'notifications-outline' as const },
  { key: 'contacts', icon: 'people-outline' as const },
  { key: 'welfare', icon: 'heart-outline' as const },
] as const;

export default function PlusScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  if (!UI_FEATURE_FLAGS.showPlusUpsellUI) {
    return <Redirect href="/(tabs)/settings" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={t('plus.title')}
        subtitle={t('plus.subtitle')}
        iconName="diamond-outline"
        rightElement={(
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color={BaseColors.primary} />
          </TouchableOpacity>
        )}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Ionicons name="lock-closed" size={14} color={BaseColors.primaryDark} />
            <Text style={styles.heroBadgeText}>{t('plus.badge')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('plus.heading')}</Text>
          <Text style={styles.heroText}>{t('plus.description')}</Text>
        </View>

        <View style={styles.featuresCard}>
          {FEATURE_ICONS.map((feature) => (
            <View key={feature.key} style={styles.featureRow}>
              <View style={styles.featureIconWrap}>
                <Ionicons name={feature.icon} size={20} color={BaseColors.primary} />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>{t(`plus.features.${feature.key}.title`)}</Text>
                <Text style={styles.featureDescription}>
                  {t(`plus.features.${feature.key}.description`)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>{t('plus.comingSoon.title')}</Text>
          <Text style={styles.footerText}>{t('plus.comingSoon.message')}</Text>
          <View style={styles.disabledButton}>
            <Text style={styles.disabledButtonText}>{t('plus.comingSoon.button')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BaseColors.background,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BaseColors.primaryLight,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    marginLeft: 'auto',
  },
  scrollContent: {
    paddingHorizontal: SCREEN_PADDING.horizontal,
    paddingBottom: 24,
    gap: 14,
  },
  heroCard: {
    backgroundColor: BaseColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
    padding: 20,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: BaseColors.primaryLight,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontSize: iosFontSize(12),
    fontWeight: '700',
    color: BaseColors.primaryDark,
  },
  heroTitle: {
    fontSize: iosFontSize(24),
    fontWeight: '800',
    color: BaseColors.text.dark,
    marginBottom: 8,
  },
  heroText: {
    fontSize: iosFontSize(15),
    lineHeight: iosFontSize(22),
    color: BaseColors.neutral[500],
  },
  featuresCard: {
    backgroundColor: BaseColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BaseColors.neutral[100],
    padding: 18,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BaseColors.primaryLight,
    borderWidth: 1,
    borderColor: BaseColors.primaryBorder,
  },
  featureTextWrap: {
    flex: 1,
    paddingTop: 2,
  },
  featureTitle: {
    fontSize: iosFontSize(16),
    fontWeight: '700',
    color: BaseColors.text.dark,
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(20),
    color: BaseColors.neutral[500],
  },
  footerCard: {
    backgroundColor: BaseColors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BaseColors.neutral[100],
    padding: 20,
  },
  footerTitle: {
    fontSize: iosFontSize(18),
    fontWeight: '700',
    color: BaseColors.text.dark,
    marginBottom: 6,
  },
  footerText: {
    fontSize: iosFontSize(14),
    lineHeight: iosFontSize(20),
    color: BaseColors.neutral[500],
    marginBottom: 16,
  },
  disabledButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BaseColors.neutral[100],
    borderWidth: 1,
    borderColor: BaseColors.neutral[200],
  },
  disabledButtonText: {
    fontSize: iosFontSize(15),
    fontWeight: '700',
    color: BaseColors.neutral[500],
  },
});
