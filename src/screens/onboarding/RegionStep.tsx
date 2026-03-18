import { SUPPORTED_REGIONS } from '@/src/context/RegionProvider';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';

interface RegionStepProps {
  selectedRegion: string | null;
  selectedViaOther: boolean;
  onSelect: (regionCode: string, options?: { viaOther?: boolean }) => void;
}

const OTHER_SENTINEL = '__OTHER__';
const FlashListAny = FlashList as unknown as React.ComponentType<any>;

type RegionItem = {
  code: string;
  name: string;
  emoji: string;
};

export default function RegionStep({ selectedRegion, selectedViaOther, onSelect }: RegionStepProps) {
  const { t } = useTranslation();

  const regions = useMemo<RegionItem[]>(() => {
    return [
      ...SUPPORTED_REGIONS,
      { code: OTHER_SENTINEL, name: t('personalOnboarding.otherRegion'), emoji: '🌍' },
    ];
  }, [t]);

  const handleSelect = useCallback(
    (code: string) => {
      if (code === OTHER_SENTINEL) {
        onSelect('US', { viaOther: true });
      } else {
        onSelect(code, { viaOther: false });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [onSelect]
  );

  const isSelected = (code: string) => {
    if (code === OTHER_SENTINEL) return selectedViaOther;
    if (selectedViaOther) return false; // Don't highlight US row when "Other" was chosen
    return selectedRegion === code;
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t('personalOnboarding.regionTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.regionSubtitle')}</Text>
      </Animated.View>

      <FlashListAny
        style={styles.list}
        data={regions}
        keyExtractor={(item: RegionItem) => item.code}
        renderItem={({ item: region, index }: { item: RegionItem; index: number }) => {
          const selected = isSelected(region.code);

          return (
            <Animated.View entering={FadeInDown.duration(300).delay(index * 40)}>
              <Pressable
                style={[styles.regionItem, selected && styles.regionItemSelected]}
                accessibilityState={{ selected }}
                onPress={() => handleSelect(region.code)}
              >
                <Text style={styles.emoji}>{region.emoji}</Text>
                <Text style={styles.regionName}>{region.name}</Text>
                {selected && (
                  <View style={styles.checkBadge}>
                    <Check size={14} color={COLORS.white} />
                  </View>
                )}
              </Pressable>
            </Animated.View>
          );
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
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
    marginBottom: SPACING.l,
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  regionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.xs,
    gap: SPACING.m,
    backgroundColor: COLORS.surface,
  },
  regionItemSelected: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  emoji: {
    fontSize: 24,
  },
  regionName: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
