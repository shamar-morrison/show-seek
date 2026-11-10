import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import { AppIcon } from '@/src/components/ui/AppIcon';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

/** Standard icon to use for opening the ListActionsModal */
export const ListActionsIcon = MoreHorizontalIcon;

export interface ListAction {
  /** Unique identifier for the action */
  id: string;
  /** HugeIcons icon data to display */
  icon: IconSvgElement;
  /** Text label for the action */
  label: string;
  /** Callback when action is pressed */
  onPress: () => void;
  /** Optional color override (defaults to COLORS.text) */
  color?: string;
  /** Whether to show an active indicator badge */
  showBadge?: boolean;
  /** Whether the action is disabled */
  disabled?: boolean;
  /**
   * Set when the action opens another bottom sheet. It then runs once this sheet has closed,
   * since a sheet opening while another is still closing can leave taps unanswered on Android.
   */
  opensSheet?: boolean;
}

export interface ListActionsModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface ListActionsModalProps {
  /** Array of actions to display in the modal */
  actions: ListAction[];
  /** Optional heading above the actions, e.g. the name of what they act on */
  title?: string;
  /** Called once the sheet has fully closed */
  onDidDismiss?: () => void;
}

const ListActionsModal = forwardRef<ListActionsModalRef, ListActionsModalProps>(
  ({ actions, title, onDidDismiss }, ref) => {
    const iconBadgeStyles = useIconBadgeStyles();
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();
    // Whether the sheet is open (or opening). On Android, dismissing a sheet that isn't open
    // leaves TrueSheet stuck "dismissing": it stops closing and its dismiss never resolves.
    const isOpenRef = useRef(false);

    const dismissIfOpen = useCallback(async () => {
      if (!isOpenRef.current) return;
      isOpenRef.current = false;
      await sheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        isOpenRef.current = true;
        await sheetRef.current?.present();
      },
      dismiss: dismissIfOpen,
    }));

    const handleDidDismiss = useCallback(() => {
      isOpenRef.current = false;
      onDidDismiss?.();
    }, [onDidDismiss]);

    const handleActionPress = useCallback(
      async (action: ListAction) => {
        if (action.disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (action.opensSheet) {
          await dismissIfOpen();
          action.onPress();
          return;
        }
        // Execute action first, then dismiss modal
        action.onPress();
        void dismissIfOpen();
      },
      [dismissIfOpen]
    );

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
        onDidDismiss={handleDidDismiss}
      >
        <GestureHandlerRootView style={[styles.content, { width }]}>
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {actions.map((action, index) => {
            const IconComponent = action.icon;
            const isDisabled = action.disabled ?? false;
            const iconColor = isDisabled ? COLORS.textSecondary : (action.color ?? COLORS.text);
            const isLast = index === actions.length - 1;

            return (
              <Pressable
                key={action.id}
                style={[styles.actionRow, !isLast && styles.actionRowBorder]}
                onPress={() => handleActionPress(action)}
                accessibilityLabel={action.label}
                accessibilityRole="button"
                accessibilityState={{ disabled: isDisabled }}
                disabled={isDisabled}
              >
                <View style={styles.iconContainer}>
                  <AppIcon icon={IconComponent} size={24} color={iconColor} />
                  {action.showBadge && <View style={iconBadgeStyles.badge} />}
                </View>
                <Text style={[styles.label, { color: iconColor }]}>{action.label}</Text>
              </Pressable>
            );
          })}
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

ListActionsModal.displayName = 'ListActionsModal';

export default ListActionsModal;

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
    // paddingHorizontal: SPACING.m,
    minHeight: 56,
    gap: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.surfaceLight,
  },
  iconContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.medium,
    flex: 1,
  },
  title: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
    paddingBottom: SPACING.s,
    paddingTop: SPACING.xs,
  },
});
