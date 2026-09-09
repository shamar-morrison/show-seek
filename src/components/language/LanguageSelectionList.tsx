import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from '@/src/constants/supportedLanguages';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

interface LanguageSelectionListProps {
  selectedLanguage: SupportedLanguageCode;
  accentColor: string;
  errorTitle: string;
  errorMessage: string;
  onSelectLanguage: (languageCode: SupportedLanguageCode) => Promise<void> | void;
}

export function LanguageSelectionList({
  selectedLanguage,
  accentColor,
  errorTitle,
  errorMessage,
  onSelectLanguage,
}: LanguageSelectionListProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleSelectLanguage = useCallback(
    async (languageCode: SupportedLanguageCode) => {
      if (languageCode === selectedLanguage || isUpdating !== null) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsUpdating(languageCode);

      try {
        await onSelectLanguage(languageCode);
      } catch (error) {
        console.error('[LanguageSelectionList] Error updating language:', error);
        Alert.alert(errorTitle, errorMessage);
      } finally {
        setIsUpdating(null);
      }
    },
    [errorMessage, errorTitle, isUpdating, onSelectLanguage, selectedLanguage]
  );

  return (
    <View style={styles.languageList}>
      {SUPPORTED_LANGUAGES.map((language) => {
        const isSelected = selectedLanguage === language.code;
        const isLoading = isUpdating === language.code;

        return (
          <Pressable
            key={language.code}
            testID={`language-option-${language.code}`}
            style={({ pressed }) => [
              styles.languageItem,
              isSelected && styles.languageItemSelected,
              pressed && styles.languageItemPressed,
            ]}
            onPress={() => {
              void handleSelectLanguage(language.code);
            }}
            disabled={isUpdating !== null}
          >
            <View style={styles.languageInfo}>
              <Text style={[styles.languageNativeName, isSelected && { color: accentColor }]}>
                {language.nativeName}
              </Text>
              <Text style={styles.languageEnglishName}>{language.englishName}</Text>
            </View>

            <View style={styles.languageStatus}>
              {isLoading ? (
                <ActivityIndicator size="small" color={accentColor} />
              ) : isSelected ? (
                <View
                  style={[styles.checkContainer, { backgroundColor: hexToRGBA(accentColor, 0.2) }]}
                >
                  <AppIcon icon={Tick02Icon} size={20} color={accentColor} />
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  languageList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    fontFamily: FONT_FAMILY.medium,
    marginBottom: 2,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
});
