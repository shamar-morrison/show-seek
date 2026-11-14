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
import { SearchField } from '@/src/components/ui/SearchField';
import { regionMatches } from '@/src/utils/settingsSearch';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const regions = useMemo(() => SUPPORTED_REGIONS.filter((r) => regionMatches(query, r)), [query]);

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
      {/* Pinned above the list, so it's always there while scrolling. */}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t('settings.searchRegions')}
        style={styles.search}
        testID="region-search"
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.description}>{t('settings.regionScreenDescription')}</Text>

        {regions.length === 0 ? (
          <Text style={styles.emptyText} testID="region-search-empty">
            {t('common.noResults')}
          </Text>
        ) : (
          <View style={styles.regionList}>
            {regions.map((r) => {
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
        )}

        <Text style={styles.note}>{t('settings.regionScreenNote')}</Text>
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
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    paddingVertical: SPACING.xl,
    textAlign: 'center',
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
  regionList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    flexShrink: 1, // wrap within its row instead of pushing siblings off
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
