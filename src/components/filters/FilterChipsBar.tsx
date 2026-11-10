import { AppIcon } from '@/src/components/ui/AppIcon';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Bookmark02Icon, Cancel01Icon, FilterRemoveIcon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

export interface FilterChip {
  key: string;
  /** Base test ID; the tappable body gets `-edit` and the ✕ gets `-remove`. */
  testID: string;
  /** Field name shown muted before the value; omitted when the value speaks for itself. */
  label?: string;
  value: string;
  /** Opens whatever lets this value be adjusted. */
  onPress: () => void;
  onRemove: () => void;
  /** Accessibility hint for the chip body. */
  editLabel: string;
  /** Accessibility label for the ✕. */
  removeLabel: string;
}

/** The saved preset the active filters match, shown by name before the filter chips. */
export interface PresetNameChip {
  name: string;
  /** Opens the filter sheet, where the preset can be managed. */
  onPress: () => void;
  testID: string;
}

interface FilterChipsBarProps {
  chips: FilterChip[];
  onClearAll: () => void;
  presetChip?: PresetNameChip;
  testID?: string;
  clearAllTestID?: string;
}

/**
 * A horizontal strip of removable chips for active filters. Each chip clears itself with its ✕
 * or runs `onPress` when tapped; "Clear All" appears with two or more chips. A matching saved
 * preset is named first. Renders nothing without chips.
 */
export function FilterChipsBar({
  chips,
  onClearAll,
  presetChip,
  testID = 'active-filters-bar',
  clearAllTestID = 'active-filters-clear-all',
}: FilterChipsBarProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    viewportWidthRef.current = event.nativeEvent.layout.width;
  }, []);

  // Removing a chip shrinks the row, but the scroll position stays where it was, which would
  // leave blank space past the last chip. Pull the row back so it ends at the screen edge.
  const handleContentSizeChange = useCallback((contentWidth: number) => {
    const maxScrollX = Math.max(0, contentWidth - viewportWidthRef.current);
    if (scrollXRef.current > maxScrollX) {
      scrollXRef.current = maxScrollX;
      scrollRef.current?.scrollTo({ x: maxScrollX, animated: true });
    }
  }, []);

  if (chips.length === 0) return null;

  const handleRemove = (chip: FilterChip) => {
    void Haptics.selectionAsync();
    chip.onRemove();
  };

  const handleClearAll = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClearAll();
  };

  return (
    <View testID={testID}>
      <ScrollView
        ref={scrollRef}
        {...HORIZONTAL_SCROLL_PROPS}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* A single chip already has its own ✕, so Clear All only appears for two or more. */}
        {chips.length > 1 && (
          <Pressable
            style={({ pressed }) => [styles.clearChip, pressed && styles.pressed]}
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel={t('common.clearAll')}
            testID={clearAllTestID}
          >
            <AppIcon icon={FilterRemoveIcon} size={14} color={COLORS.textSecondary} />
            <Text style={styles.clearChipText}>{t('common.clearAll')}</Text>
          </Pressable>
        )}

        {presetChip && (
          <Pressable
            style={({ pressed }) => [
              styles.clearChip,
              { borderColor: accentColor },
              pressed && styles.pressed,
            ]}
            onPress={presetChip.onPress}
            accessibilityRole="button"
            accessibilityLabel={t('filterPresets.activePresetLabel', { name: presetChip.name })}
            accessibilityHint={t('filterPresets.activePresetHint')}
            testID={presetChip.testID}
          >
            <AppIcon icon={Bookmark02Icon} size={14} color={accentColor} />
            <Text style={styles.presetChipText} numberOfLines={1}>
              {presetChip.name}
            </Text>
          </Pressable>
        )}

        {chips.map((chip) => (
          <Chip
            key={chip.key}
            chip={chip}
            accentColor={accentColor}
            onRemove={() => handleRemove(chip)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({
  chip,
  accentColor,
  onRemove,
}: {
  chip: FilterChip;
  accentColor: string;
  onRemove: () => void;
}) {
  const { testID, label, value, onPress, editLabel, removeLabel } = chip;
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: hexToRGBA(accentColor, 0.12),
          borderColor: hexToRGBA(accentColor, 0.35),
        },
      ]}
      testID={testID}
    >
      <Pressable
        style={({ pressed }) => [styles.chipBody, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value}` : value}
        accessibilityHint={editLabel}
        testID={`${testID}-edit`}
      >
        <Text style={styles.chipText} numberOfLines={1}>
          {label ? <Text style={styles.chipLabel}>{`${label} `}</Text> : null}
          {value}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.removeButton,
          { backgroundColor: hexToRGBA(accentColor, pressed ? 0.4 : 0.22) },
        ]}
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        testID={`${testID}-remove`}
      >
        <AppIcon icon={Cancel01Icon} size={12} color={COLORS.text} />
      </Pressable>
    </View>
  );
}

const CHIP_HEIGHT = 34;

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: 'row',
    height: CHIP_HEIGHT,
    paddingRight: SPACING.xs,
  },
  chipBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: '100%',
    paddingLeft: SPACING.m,
    paddingRight: SPACING.s,
  },
  chipText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
    maxWidth: 240,
  },
  chipLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.medium,
  },
  removeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  clearChip: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: CHIP_HEIGHT,
    paddingHorizontal: SPACING.m,
  },
  clearChipText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
  },
  presetChipText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
    maxWidth: 200,
  },
  pressed: {
    opacity: 0.7,
  },
});
