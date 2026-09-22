import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface WatchProgressOptionsSheetRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface WatchProgressOptionsSheetProps {
  hideCompleted: boolean;
  onToggleHideCompleted: (value: boolean) => void;
}

/**
 * Bottom sheet with view options for the Watch Progress screen.
 * Currently hosts the "Hide completed series" toggle, which filters
 * ended + fully watched shows out of the Caught Up tab.
 */
const WatchProgressOptionsSheet = forwardRef<
  WatchProgressOptionsSheetRef,
  WatchProgressOptionsSheetProps
>(({ hideCompleted, onToggleHideCompleted }, ref) => {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const sheetRef = useRef<TrueSheet>(null);
  const { width } = useWindowDimensions();

  useImperativeHandle(ref, () => ({
    present: async () => {
      await sheetRef.current?.present();
    },
    dismiss: async () => {
      await sheetRef.current?.dismiss();
    },
  }));

  const handleToggle = useCallback(
    (value: boolean) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggleHideCompleted(value);
    },
    [onToggleHideCompleted]
  );

  const handleRowPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleHideCompleted(!hideCompleted);
  }, [hideCompleted, onToggleHideCompleted]);

  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      grabber={false}
    >
      <GestureHandlerRootView style={[styles.content, { width }]}>
        <Pressable
          style={styles.optionRow}
          onPress={handleRowPress}
          accessibilityLabel={t('library.hideCompletedSeries')}
          accessibilityRole="switch"
          accessibilityState={{ checked: hideCompleted }}
          testID="watch-progress-hide-completed-row"
        >
          <View style={styles.iconContainer}>
            <AppIcon icon={ViewOffSlashIcon} size={24} color={COLORS.text} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.label}>{t('library.hideCompletedSeries')}</Text>
            <Text style={styles.description}>{t('library.hideCompletedSeriesHint')}</Text>
          </View>
          <Switch
            value={hideCompleted}
            onValueChange={handleToggle}
            trackColor={{ false: COLORS.surfaceLight, true: accentColor }}
            thumbColor={COLORS.white}
            testID="watch-progress-hide-completed-switch"
          />
        </Pressable>
      </GestureHandlerRootView>
    </TrueSheet>
  );
});

WatchProgressOptionsSheet.displayName = 'WatchProgressOptionsSheet';

export { WatchProgressOptionsSheet };
export default WatchProgressOptionsSheet;

const styles = StyleSheet.create({
  content: {
    padding: SPACING.m,
    paddingBottom: SPACING.xl,
    flexGrow: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    minHeight: 56,
    gap: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.text,
    marginBottom: 2,
  },
  description: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
