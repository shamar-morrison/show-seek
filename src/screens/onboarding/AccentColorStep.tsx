import { ACCENT_COLORS, DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface AccentColorStepProps {
  selectedColor: string | null;
  onSelect: (color: string) => void;
}

export default function AccentColorStep({ selectedColor, onSelect }: AccentColorStepProps) {
  const { t } = useTranslation();

  const handleSelect = useCallback(
    (color: string) => {
      onSelect(color);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [onSelect]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t('personalOnboarding.accentColorTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.accentColorSubtitle')}</Text>
      </Animated.View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        {ACCENT_COLORS.map((color, index) => {
          const isSelected = selectedColor === color.value;

          return (
            <Animated.View
              key={color.value}
              entering={FadeInDown.duration(300).delay(index * 40)}
            >
              <Pressable
                style={[styles.colorItem, isSelected && styles.colorItemSelected]}
                onPress={() => handleSelect(color.value)}
              >
                <View
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color.value },
                    isSelected && styles.colorCircleSelected,
                  ]}
                >
                  {isSelected && <Check size={18} color={COLORS.white} />}
                </View>
                <Text style={[styles.colorName, isSelected && styles.colorNameSelected]}>
                  {color.name}
                </Text>
              </Pressable>
            </Animated.View>
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    paddingBottom: SPACING.xl,
    justifyContent: 'center',
  },
  colorItem: {
    alignItems: 'center',
    width: 80,
    gap: SPACING.s,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
  },
  colorItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  colorCircle: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorCircleSelected: {
    borderColor: COLORS.white,
    transform: [{ scale: 1.1 }],
  },
  colorName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  colorNameSelected: {
    color: COLORS.white,
  },
});
