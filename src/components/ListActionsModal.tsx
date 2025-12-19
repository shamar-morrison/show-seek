import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { LucideIcon } from 'lucide-react-native';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      present: async () => {
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleActionPress = useCallback((action: ListAction) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sheetRef.current?.dismiss();
      // Small delay to allow modal to dismiss before executing action
      timeoutRef.current = setTimeout(() => {
        action.onPress();
      }, 100);
    }, []);

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
      >
        <View style={styles.content}>
          {actions.map((action, index) => {
            const IconComponent = action.icon;
            const iconColor = action.color ?? COLORS.text;
            const isLast = index === actions.length - 1;

            return (
              <TouchableOpacity
                hitSlop={HIT_SLOP.l}
                key={action.id}
                style={[styles.actionRow, !isLast && styles.actionRowBorder]}
                onPress={() => handleActionPress(action)}
                activeOpacity={ACTIVE_OPACITY}
                accessibilityLabel={action.label}
                accessibilityRole="button"
              >
                <View style={styles.iconContainer}>
                  <IconComponent size={24} color={iconColor} />
                  {action.showBadge && <View style={styles.badge} />}
                </View>
                <Text style={[styles.label, { color: iconColor }]}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.s,
    minHeight: 56,
    gap: SPACING.m,
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
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
  label: {
    fontSize: FONT_SIZE.m,
    fontWeight: '500',
  },
});
