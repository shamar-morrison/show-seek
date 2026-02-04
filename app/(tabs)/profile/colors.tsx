/**
 * Accent Color Selection Screen
 * Allows users to select their preferred accent/primary color
 */
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING, hexToRGBA } from '@/src/constants/theme';
import { SUPPORTED_ACCENT_COLORS, useAccentColor } from '@/src/context/AccentColorProvider';
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

export default function AccentColorScreen() {
  const { t } = useTranslation();
  const { accentColor, setAccentColor } = useAccentColor();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleSelectColor = async (colorValue: string) => {
    if (colorValue === accentColor) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(colorValue);

    try {
      await setAccentColor(colorValue);
    } catch (error) {
      console.error('[AccentColorScreen] Error updating accent color:', error);
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('settings.accentColorDescription')}</Text>

        <View style={styles.colorList}>
          {SUPPORTED_ACCENT_COLORS.map((colorOption) => {
            const isSelected = accentColor === colorOption.value;
            const isLoading = isUpdating === colorOption.value;

            return (
              <Pressable
                key={colorOption.value}
                style={({ pressed }) => [
                  styles.colorItem,
                  isSelected && styles.colorItemSelected,
                  pressed && styles.colorItemPressed,
                ]}
                onPress={() => handleSelectColor(colorOption.value)}
                disabled={isUpdating !== null}
              >
                <View style={styles.colorInfo}>
                  <View style={[styles.colorDot, { backgroundColor: colorOption.value }]} />
                  <Text style={[styles.colorName, isSelected && { color: accentColor }]}>
                    {colorOption.name}
                  </Text>
                </View>

                <View style={styles.colorStatus}>
                  {isLoading ? (
                    <ActivityIndicator size="small" color={accentColor} />
                  ) : isSelected ? (
                    <View
                      style={[
                        styles.checkContainer,
                        { backgroundColor: hexToRGBA(accentColor, 0.2) },
                      ]}
                    >
                      <Check size={20} color={accentColor} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>{t('settings.accentColorNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.l,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.l,
    lineHeight: 22,
  },
  colorList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  colorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  colorItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  colorItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  colorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    flex: 1,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorName: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontWeight: '500',
  },
  colorStatus: {
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
