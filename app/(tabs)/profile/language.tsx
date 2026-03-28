/**
 * Language Selection Screen
 * Allows users to select their preferred language for TMDB content
 */
import { LanguageSelectionList } from '@/src/components/language/LanguageSelectionList';
import {
  COLORS,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useLanguage } from '@/src/context/LanguageProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LanguageScreen() {
  const { language, setLanguage } = useLanguage();
  const { accentColor } = useAccentColor();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          {t('settings.languageScreenDescription')}
        </Text>

        <LanguageSelectionList
          selectedLanguage={language}
          accentColor={accentColor}
          errorTitle={t('common.error')}
          errorMessage={t('settings.updateLanguageError')}
          onSelectLanguage={setLanguage}
        />

        <Text style={styles.note}>
          {t('settings.languageScreenNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.l,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.l,
    lineHeight: 22,
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
