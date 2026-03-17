import { SUPPORTED_REGIONS } from '@/src/context/RegionProvider';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface RegionStepProps {
  selectedRegion: string | null;
  onSelect: (regionCode: string) => void;
}

const OTHER_SENTINEL = '__OTHER__';

export default function RegionStep({ selectedRegion, onSelect }: RegionStepProps) {
  const { t } = useTranslation();

  const regions = useMemo(() => {
    return [
      ...SUPPORTED_REGIONS,
      { code: OTHER_SENTINEL, name: t('personalOnboarding.otherRegion'), emoji: '🌍' },
    ];
  }, [t]);

  // Track if "Other" was the explicit choice (maps to US internally)
  const [selectedViaOther, setSelectedViaOther] = React.useState(false);

  const handleSelect = useCallback(
    (code: string) => {
      if (code === OTHER_SENTINEL) {
        setSelectedViaOther(true);
        onSelect('US');
      } else {
        setSelectedViaOther(false);
        onSelect(code);
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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {regions.map((region) => {
          const selected = isSelected(region.code);

          return (
            <Pressable
              key={region.code}
              style={[styles.regionItem, selected && styles.regionItemSelected]}
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
          );
        })}
      </ScrollView>
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
    borderColor: 'rgba(255,255,255,0.15)',
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
