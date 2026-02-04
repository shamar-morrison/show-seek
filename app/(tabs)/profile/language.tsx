/**
 * Language Selection Screen
 * Allows users to select their preferred language for TMDB content
 */
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { SUPPORTED_LANGUAGES, useLanguage } from '@/src/context/LanguageProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LanguageScreen() {
  const { language, setLanguage } = useLanguage();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleSelectLanguage = async (languageCode: string) => {
    if (languageCode === language) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(languageCode);

    try {
      await setLanguage(languageCode);
    } catch (error) {
      console.error('[LanguageScreen] Error updating language:', error);
      Alert.alert(t('common.error'), t('settings.updateLanguageError'));
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>
          {t('settings.languageScreenDescription')}
        </Text>

        <View style={styles.languageList}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = language === lang.code;
            const isLoading = isUpdating === lang.code;

            return (
              <Pressable
                key={lang.code}
                style={({ pressed }) => [
                  styles.languageItem,
                  isSelected && styles.languageItemSelected,
                  pressed && styles.languageItemPressed,
                ]}
                onPress={() => handleSelectLanguage(lang.code)}
                disabled={isUpdating !== null}
              >
                <View style={styles.languageInfo}>
                  <Text
                    style={[
                      styles.languageNativeName,
                      isSelected && styles.languageNativeNameSelected,
                    ]}
                  >
                    {lang.nativeName}
                  </Text>
                  <Text style={styles.languageEnglishName}>{lang.englishName}</Text>
                </View>

                <View style={styles.languageStatus}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : isSelected ? (
                    <View style={styles.checkContainer}>
                      <Check size={20} color={COLORS.primary} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

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
  languageList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  languageItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  languageItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  languageInfo: {
    flex: 1,
  },
  languageNativeName: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 2,
  },
  languageNativeNameSelected: {
    color: COLORS.primary,
  },
  languageEnglishName: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  languageStatus: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
