import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { logModalEvent } from '@/src/services/analytics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { History, Trash2 } from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface WatchHistoryActionsModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface WatchHistoryActionsModalProps {
  /** Callback when user wants to view watch history */
  onViewHistory: () => void;
  /** Callback when user wants to clear watch history */
  onClearHistory: () => void;
}

/**
 * TrueSheet modal with options to view or clear watch history.
 * Triggered by long-pressing the "Mark as Watched" button.
 */
const WatchHistoryActionsModal = forwardRef<
  WatchHistoryActionsModalRef,
  WatchHistoryActionsModalProps
>(({ onViewHistory, onClearHistory }, ref) => {
  const { t } = useTranslation();
  const sheetRef = useRef<TrueSheet>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const isDismissingRef = useRef(false);
  const { width } = useWindowDimensions();

  useImperativeHandle(ref, () => ({
    present: async () => {
      await sheetRef.current?.present();
    },
    dismiss: async () => {
      await sheetRef.current?.dismiss();
    },
  }));

  const handleViewHistory = useCallback(async () => {
    if (isDismissingRef.current) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pendingActionRef.current = onViewHistory;
    isDismissingRef.current = true;

    try {
      await sheetRef.current?.dismiss();
    } catch (error) {
      pendingActionRef.current = null;
      isDismissingRef.current = false;
      console.error('[WatchHistoryActionsModal] Failed to dismiss before view action', error);
    }
  }, [onViewHistory]);

  const handleClearHistory = useCallback(async () => {
    if (isDismissingRef.current) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pendingActionRef.current = onClearHistory;
    isDismissingRef.current = true;

    try {
      await sheetRef.current?.dismiss();
    } catch (error) {
      pendingActionRef.current = null;
      isDismissingRef.current = false;
      console.error('[WatchHistoryActionsModal] Failed to dismiss before clear action', error);
    }
  }, [onClearHistory]);

  const handleDidPresent = useCallback(() => {
    isDismissingRef.current = false;
    void logModalEvent('watch_history_actions_sheet', 'present');
  }, []);

  const handleDidDismiss = useCallback(() => {
    isDismissingRef.current = false;
    void logModalEvent('watch_history_actions_sheet', 'dismiss');

    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    pendingAction?.();
  }, []);

  const actions = [
    {
      id: 'view',
      icon: History,
      label: t('watched.viewWatchHistory'),
      description: t('watched.viewWatchHistoryDescription'),
      onPress: handleViewHistory,
      color: COLORS.text,
    },
    {
      id: 'clear',
      icon: Trash2,
      label: t('watched.clearAllWatchHistory'),
      description: t('watched.clearWatchHistoryDescription'),
      onPress: handleClearHistory,
      color: COLORS.error,
    },
  ];

  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      onDidPresent={handleDidPresent}
      onDidDismiss={handleDidDismiss}
      grabber={false}
    >
      <GestureHandlerRootView style={[styles.content, { width }]}>
        {actions.map((action, index) => {
          const IconComponent = action.icon;
          const isLast = index === actions.length - 1;

          return (
            <Pressable
              key={action.id}
              style={[styles.actionRow, !isLast && styles.actionRowBorder]}
              onPress={action.onPress}
              accessibilityLabel={action.label}
              accessibilityRole="button"
            >
              <View style={styles.iconContainer}>
                <IconComponent size={24} color={action.color} />
              </View>
              <View style={styles.textContainer}>
                <Text style={[styles.label, { color: action.color }]}>{action.label}</Text>
                <Text style={styles.description}>{action.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </GestureHandlerRootView>
    </TrueSheet>
  );
});

WatchHistoryActionsModal.displayName = 'WatchHistoryActionsModal';

export { WatchHistoryActionsModal };
export default WatchHistoryActionsModal;

const styles = StyleSheet.create({
  content: {
    padding: SPACING.m,
    paddingBottom: SPACING.xl,
    flexGrow: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    minHeight: 56,
    gap: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surfaceLight,
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
    fontWeight: '500',
    marginBottom: 2,
  },
  description: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
