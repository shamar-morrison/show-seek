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
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
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

/** The option label's line height; the radio is centered on that first line. */
const LABEL_LINE_HEIGHT = 22;
const RADIO_SIZE = 20;

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
        <View style={styles.options}>
          {CONTINUE_WATCHING_FROM_OPTIONS.map((option) => {
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
                  styles.option,
                  isSelected && {
                    borderColor: accentColor,
                    backgroundColor: hexToRGBA(accentColor, 0.08),
                  },
                  pressed && styles.optionPressed,
                ]}
                onPress={() => handleSelect(option)}
                disabled={isUpdating !== null}
              >
                <View style={styles.radioSlot}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : (
                    <View style={[styles.radio, isSelected && { borderColor: accentColor }]}>
                      {isSelected ? (
                        <View style={[styles.radioDot, { backgroundColor: accentColor }]} />
                      ) : null}
                    </View>
                  )}
                </View>

                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{t(`continueWatchingFrom.${key}.label`)}</Text>
                  <Text style={styles.optionDescription}>
                    {t(`continueWatchingFrom.${key}.description`)}
                  </Text>
                  <View style={styles.example}>
                    <Text style={styles.exampleWatched}>
                      {t(`continueWatchingFrom.${key}.example.watched`)}
                    </Text>
                    <AppIcon icon={ArrowRight02Icon} size={14} color={COLORS.textSecondary} />
                    <Text style={styles.exampleNext}>
                      {t(`continueWatchingFrom.${key}.example.next`)}
                    </Text>
                  </View>
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
  options: {
    gap: SPACING.m,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.m,
    padding: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  optionPressed: {
    opacity: ACTIVE_OPACITY,
  },
  radioSlot: {
    width: RADIO_SIZE,
    height: LABEL_LINE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: FONT_SIZE.m,
    lineHeight: LABEL_LINE_HEIGHT,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
  },
  optionDescription: {
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  example: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-start',
    columnGap: SPACING.s,
    rowGap: SPACING.xs,
    marginTop: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  exampleWatched: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
    color: COLORS.textSecondary,
  },
  exampleNext: {
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.medium,
  },
  note: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.l,
    lineHeight: 20,
    textAlign: 'center',
  },
});
