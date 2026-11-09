import DiscoverFilters from '@/src/components/DiscoverFilters';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import {
  areDiscoverFiltersEqual,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface DiscoverFiltersSheetRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface DiscoverFiltersSheetProps {
  /** The filters in use; the sheet starts from these each time it opens. */
  filters: DiscoverFilterState;
  onApply: (filters: DiscoverFilterState) => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
}

/**
 * Discover's filters in a bottom sheet. Picks are held as a draft and only reach the results
 * on Apply, so the list reloads once. Apply is disabled while nothing would change.
 */
const DiscoverFiltersSheet = forwardRef<DiscoverFiltersSheetRef, DiscoverFiltersSheetProps>(
  ({ filters, onApply, mediaType, genreMap }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const [draft, setDraft] = useState<DiscoverFilterState>(filters);

    useImperativeHandle(ref, () => ({
      present: async () => {
        setDraft(filters);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const canApply = !areDiscoverFiltersEqual(draft, filters);
    const canClear = !areDiscoverFiltersEqual(draft, DEFAULT_DISCOVER_FILTERS);

    const handleClear = () => {
      void Haptics.selectionAsync();
      setDraft(DEFAULT_DISCOVER_FILTERS);
    };

    const handleApply = () => {
      if (!canApply) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onApply(draft);
      void sheetRef.current?.dismiss();
    };

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
      >
        <GestureHandlerRootView style={[modalSheetStyles.content, styles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('discover.filters')}</Text>
            <Pressable
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="discover-filters-close"
            >
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <DiscoverFilters
            filters={draft}
            onChange={setDraft}
            mediaType={mediaType}
            genreMap={genreMap}
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.clearButton, !canClear && styles.disabledButton]}
              onPress={handleClear}
              disabled={!canClear}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canClear }}
              testID="discover-filters-clear"
            >
              <Text style={styles.clearButtonText}>{t('common.clearAll')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.applyButton,
                { backgroundColor: accentColor },
                !canApply && styles.disabledButton,
              ]}
              onPress={handleApply}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              testID="discover-filters-apply"
            >
              <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

DiscoverFiltersSheet.displayName = 'DiscoverFiltersSheet';

export default DiscoverFiltersSheet;

const styles = StyleSheet.create({
  content: {
    paddingBottom: SPACING.l,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.l,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  clearButtonText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  applyButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  applyButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
