import { LanguageSelectionList } from '@/src/components/language/LanguageSelectionList';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import type { SupportedLanguageCode } from '@/src/constants/supportedLanguages';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

interface LanguagesStepProps {
  selectedLanguage: SupportedLanguageCode;
  onSelect: (languageCode: SupportedLanguageCode) => Promise<void>;
}

export default function LanguagesStep({ selectedLanguage, onSelect }: LanguagesStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.header}>
        <Text style={styles.title}>{t('personalOnboarding.languagesTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.languagesSubtitle')}</Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <LanguageSelectionList
          selectedLanguage={selectedLanguage}
          accentColor={accentColor}
          errorTitle={t('common.error')}
          errorMessage={t('settings.updateLanguageError')}
          onSelectLanguage={onSelect}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
  },
  header: {
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    borderRadius: BORDER_RADIUS.l,
  },
});
