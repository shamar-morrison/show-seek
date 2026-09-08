/**
 * Region Selection Screen
 * Allows users to select their preferred region for watch providers and release dates
 */
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
import { SUPPORTED_REGIONS, useRegion } from '@/src/context/RegionProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
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

export default function RegionScreen() {
  const { region, setRegion } = useRegion();
  const { accentColor } = useAccentColor();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleSelectRegion = async (regionCode: string) => {
    if (regionCode === region) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(regionCode);

    try {
      await setRegion(regionCode);
    } catch (error) {
      console.error('[RegionScreen] Error updating region:', error);
      Alert.alert(t('common.error'), t('settings.updateRegionError'));
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('settings.regionScreenDescription')}</Text>

        <View style={styles.regionList}>
          {SUPPORTED_REGIONS.map((r) => {
            const isSelected = region === r.code;
            const isLoading = isUpdating === r.code;

            return (
              <Pressable
                key={r.code}
                style={({ pressed }) => [
                  styles.regionItem,
                  isSelected && styles.regionItemSelected,
                  pressed && styles.regionItemPressed,
                ]}
                onPress={() => handleSelectRegion(r.code)}
                disabled={isUpdating !== null}
              >
                <View style={styles.regionInfo}>
                  <Text style={styles.regionEmoji}>{r.emoji}</Text>
                  <Text style={[styles.regionName, isSelected && { color: accentColor }]}>
                    {r.name}
                  </Text>
                </View>

                <View style={styles.regionStatus}>
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

        <Text style={styles.note}>{t('settings.regionScreenNote')}</Text>
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
  regionList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  regionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  regionItemSelected: {
    backgroundColor: COLORS.surfaceLight,
  },
  regionItemPressed: {
    opacity: ACTIVE_OPACITY,
  },
  regionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  regionEmoji: {
    fontSize: 24,
  },
  regionName: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.medium,
  },
  regionStatus: {
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
