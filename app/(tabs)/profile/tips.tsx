/**
 * Tips & Features: shortcuts that are easy to miss, mostly long presses, grouped by where
 * they're used. The list itself lives in src/constants/tips.ts.
 */
import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { TIP_SECTIONS } from '@/src/constants/tips';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TipsScreen() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('tips.intro')}</Text>

        {TIP_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section} testID={`tips-section-${section.id}`}>
            <Text style={[styles.sectionTitle, { color: accentColor }]}>
              {t(`tips.sections.${section.id}`)}
            </Text>
            <View style={styles.card}>
              {section.tips.map((tip, index) => (
                <View
                  key={tip.id}
                  style={[styles.tip, index < section.tips.length - 1 && styles.tipDivider]}
                  testID={`tip-${tip.id}`}
                >
                  <View style={styles.iconWrap}>
                    <AppIcon icon={tip.icon} size={22} color={COLORS.text} />
                  </View>
                  <View style={styles.tipText}>
                    <Text style={styles.tipTitle}>{t(`tips.items.${tip.id}.title`)}</Text>
                    <Text style={styles.tipDescription}>
                      {t(`tips.items.${tip.id}.description`)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  intro: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.l,
  },
  section: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
    marginBottom: SPACING.s,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tip: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.m,
    padding: SPACING.m,
  },
  tipDivider: {
    borderBottomColor: COLORS.surfaceLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  tipText: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  tipDescription: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },
});
