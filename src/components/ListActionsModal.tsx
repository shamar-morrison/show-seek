import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { iconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { Ellipsis, LucideIcon } from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

/** Standard icon to use for opening the ListActionsModal */
export const ListActionsIcon = Ellipsis;

export interface ListAction {
  /** Unique identifier for the action */
  id: string;
  /** Lucide icon component to display */
  icon: LucideIcon;
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
}

export interface ListActionsModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface ListActionsModalProps {
  /** Array of actions to display in the modal */
  actions: ListAction[];
}

const ListActionsModal = forwardRef<ListActionsModalRef, ListActionsModalProps>(
  ({ actions }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();

    useImperativeHandle(ref, () => ({
      present: async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleActionPress = useCallback((action: ListAction) => {
      if (action.disabled) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Execute action first, then dismiss modal
      action.onPress();
      sheetRef.current?.dismiss();
    }, []);

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
      >
        <GestureHandlerRootView style={[styles.content, { width }]}>
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
                  <IconComponent size={24} color={iconColor} />
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
    fontWeight: '500',
    flex: 1,
  },
});
