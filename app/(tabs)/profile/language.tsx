/**
 * Language Selection Screen
 * Allows users to select their preferred language for TMDB content
 */
import { LanguageSelectionList } from '@/src/components/language/LanguageSelectionList';
import { SearchField } from '@/src/components/ui/SearchField';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useLanguage } from '@/src/context/LanguageProvider';
import { LONGEST_TEXT_LANGUAGE, setLongestTextEnabled } from '@/src/i18n/longestTranslations';
import { screenStyles } from '@/src/styles/screenStyles';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LanguageScreen() {
  const { language, setLanguage } = useLanguage();
  const { accentColor } = useAccentColor();
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const isLongestTextOn = i18n.language === LONGEST_TEXT_LANGUAGE;

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      {/* Pinned above the list, so it's always there while scrolling. */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t('settings.searchLanguages')}
        style={styles.search}
        testID="language-search"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.description}>
          {t('settings.languageScreenDescription')}
        </Text>

        {/* Development builds: show every string in its longest translation, to find text that
            gets cut off or broken in any language with one pass. Never saved. */}
        {__DEV__ ? (
          <View style={styles.devRow} testID="longest-text-dev-row">
            <View style={styles.devText}>
              <Text style={styles.devTitle}>Longest text (dev)</Text>
              <Text style={styles.devDescription}>
                Shows the longest translation of every string, across all languages. Only the
                text changes; nothing is saved.
              </Text>
            </View>
            <Switch
              testID="longest-text-dev-switch"
              value={isLongestTextOn}
              onValueChange={(enabled) => void setLongestTextEnabled(enabled)}
              trackColor={{ true: accentColor }}
            />
          </View>
        ) : null}

        <LanguageSelectionList
          selectedLanguage={language}
          accentColor={accentColor}
          errorTitle={t('common.error')}
          errorMessage={t('settings.updateLanguageError')}
          onSelectLanguage={setLanguage}
          query={query}
          emptyText={t('common.noResults')}
        />

        <Text style={styles.note}>
          {t('settings.languageScreenNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: SPACING.l,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingTop: SPACING.s,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.l,
    lineHeight: 22,
  },
  devRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    padding: SPACING.m,
    marginBottom: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textSecondary,
  },
  devText: {
    flex: 1,
  },
  devTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  devDescription: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  note: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.l,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
});
