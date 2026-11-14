/**
 * Continue Watching From
 * Lets signed-in users choose which episode Watch Progress suggests next when they skipped one.
 */
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  CONTINUE_WATCHING_FROM_OPTIONS,
  ContinueWatchingFrom,
  resolveContinueWatchingFrom,
} from '@/src/types/preferences';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
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

/** Translation keys under `continueWatchingFrom` for each option. */
const OPTION_KEYS: Record<ContinueWatchingFrom, 'firstUnwatched' | 'afterFurthest'> = {
  'first-unwatched': 'firstUnwatched',
  'after-furthest': 'afterFurthest',
};

export default function ContinueWatchingFromScreen() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const updatePreference = useUpdatePreference();
  const { accentColor } = useAccentColor();
  const [isUpdating, setIsUpdating] = useState<ContinueWatchingFrom | null>(null);

  const current = resolveContinueWatchingFrom(preferences?.continueWatchingFrom);

  const handleSelect = async (value: ContinueWatchingFrom) => {
    if (value === current) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(value);

    try {
      await updatePreference.mutateAsync({ key: 'continueWatchingFrom', value });
    } catch (error) {
      console.error('[ContinueWatchingFrom] Error updating preference:', error);
      Alert.alert(t('common.error'), t('continueWatchingFrom.updateError'));
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('continueWatchingFrom.description')}</Text>

        <View style={styles.optionsList}>
          {CONTINUE_WATCHING_FROM_OPTIONS.map((option, index) => {
            const key = OPTION_KEYS[option];
            const isSelected = current === option;
            const isLoading = isUpdating === option;

            return (
              <Pressable
                key={option}
                testID={`continue-watching-from-option-${option}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: isUpdating !== null }}
                style={({ pressed }) => [
                  styles.optionItem,
                  index < CONTINUE_WATCHING_FROM_OPTIONS.length - 1 && styles.optionDivider,
                  isSelected && styles.optionItemSelected,
                  pressed && styles.optionItemPressed,
                ]}
                onPress={() => handleSelect(option)}
                disabled={isUpdating !== null}
              >
                <View style={styles.optionInfo}>
                  <Text style={[styles.optionLabel, isSelected && { color: accentColor }]}>
                    {t(`continueWatchingFrom.${key}.label`)}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {t(`continueWatchingFrom.${key}.description`)}
                  </Text>
                  <Text style={styles.optionExample}>
                    {t(`continueWatchingFrom.${key}.example`)}
                  </Text>
                </View>

                <View style={styles.optionStatus}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : isSelected ? (
                    <View
                      style={[
                        styles.checkContainer,
                        { backgroundColor: hexToRGBA(accentColor, 0.2) },
                      ]}
                    >
                      <AppIcon icon={Tick02Icon} size={20} color={accentColor} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>{t('continueWatchingFrom.note')}</Text>
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
  optionsList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  optionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  optionItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  optionItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  optionInfo: {
    flex: 1,
    marginRight: SPACING.m,
  },
  optionLabel: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.medium,
  },
  optionDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  optionExample: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    lineHeight: 18,
    marginTop: SPACING.s,
    opacity: 0.8,
  },
  optionStatus: {
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
  note: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.l,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.7,
  },
});
