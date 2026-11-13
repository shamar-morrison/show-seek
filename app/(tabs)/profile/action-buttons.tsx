/**
 * Reorder the round action buttons by dragging them: one tab for movie and TV show pages, one
 * for each season on a show's Seasons screen. The order is saved to preferences as soon as a
 * button is dropped.
 */
import { AppIcon } from '@/src/components/ui/AppIcon';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useDetailActionOrder } from '@/src/hooks/useDetailActionOrder';
import { useUpdatePreference } from '@/src/hooks/usePreferences';
import { useSeasonActionOrder } from '@/src/hooks/useSeasonActionOrder';
import { screenStyles } from '@/src/styles/screenStyles';
import { isDefaultActionOrder } from '@/src/utils/actionOrder';
import {
  DEFAULT_DETAIL_ACTION_ORDER,
  type DetailActionButtonId,
} from '@/src/utils/detailActionOrder';
import {
  DEFAULT_SEASON_ACTION_ORDER,
  type SeasonActionButtonId,
} from '@/src/utils/seasonActionOrder';
import {
  DragDropVerticalIcon,
  Image01Icon,
  Note01Icon,
  Notification01Icon,
  PlusSignIcon,
  StarIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable, { type SortableGridRenderItem } from 'react-native-sortables';

interface ButtonInfo {
  icon: IconSvgElement;
  labelKey: string;
  /** For a button that only shows sometimes: when it does. */
  hintKey?: string;
}

const DETAIL_BUTTONS: Record<DetailActionButtonId, ButtonInfo> = {
  list: { icon: PlusSignIcon, labelKey: 'media.addToList' },
  rating: { icon: StarIcon, labelKey: 'rating.title' },
  reminder: {
    icon: Notification01Icon,
    labelKey: 'reminder.title',
    hintKey: 'actionButtons.reminderHint',
  },
  note: { icon: Note01Icon, labelKey: 'notes.title' },
  shareCard: { icon: Image01Icon, labelKey: 'shareCard.title' },
};

const SEASON_BUTTONS: Record<SeasonActionButtonId, ButtonInfo> = {
  markAll: { icon: Tick02Icon, labelKey: 'watched.markAll', hintKey: 'actionButtons.markAllHint' },
  rating: { icon: StarIcon, labelKey: 'rating.title' },
  note: { icon: Note01Icon, labelKey: 'notes.title' },
  list: { icon: PlusSignIcon, labelKey: 'media.addToList' },
  shareCard: {
    icon: Image01Icon,
    labelKey: 'shareCard.title',
    hintKey: 'actionButtons.progressCardHint',
  },
};

type ActionButtonsTab = 'titles' | 'seasons';

export default function ActionButtonsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ActionButtonsTab>('titles');
  const detailOrder = useDetailActionOrder();
  const seasonOrder = useSeasonActionOrder();

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <SegmentedControl
          options={[
            { key: 'titles', label: t('actionButtons.tabs.titles') },
            { key: 'seasons', label: t('actionButtons.tabs.seasons') },
          ]}
          activeKey={tab}
          onChange={setTab}
          testID="action-buttons-tabs"
          style={styles.tabs}
        />
        {tab === 'titles' ? (
          <ActionOrderEditor
            key="titles"
            buttons={DETAIL_BUTTONS}
            savedOrder={detailOrder}
            defaultOrder={DEFAULT_DETAIL_ACTION_ORDER}
            preferenceKey="detailActionOrder"
            description={t('actionButtons.description')}
          />
        ) : (
          <ActionOrderEditor
            key="seasons"
            buttons={SEASON_BUTTONS}
            savedOrder={seasonOrder}
            defaultOrder={DEFAULT_SEASON_ACTION_ORDER}
            preferenceKey="seasonActionOrder"
            description={t('actionButtons.seasonsDescription')}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

interface ActionOrderEditorProps<Id extends string> {
  buttons: Record<Id, ButtonInfo>;
  savedOrder: Id[];
  defaultOrder: readonly Id[];
  preferenceKey: 'detailActionOrder' | 'seasonActionOrder';
  description: string;
}

/** One draggable list of buttons, saved to its own preference. */
function ActionOrderEditor<Id extends string>({
  buttons,
  savedOrder,
  defaultOrder,
  preferenceKey,
  description,
}: ActionOrderEditorProps<Id>) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const updatePreference = useUpdatePreference();
  const [order, setOrder] = useState<Id[]>(savedOrder);

  // Follow the saved order when it changes elsewhere (another device, a failed save).
  useEffect(() => {
    setOrder(savedOrder);
  }, [savedOrder]);

  const save = useCallback(
    (next: Id[]) => {
      const previous = order;
      setOrder(next);
      updatePreference.mutate(
        // Each list only ever holds ids of its own buttons, so the value fits its preference.
        { key: preferenceKey, value: next as DetailActionButtonId[] & SeasonActionButtonId[] },
        {
          onError: () => {
            setOrder(previous);
            Alert.alert(t('common.errorTitle'), t('actionButtons.saveFailed'));
          },
        }
      );
    },
    [order, preferenceKey, t, updatePreference]
  );

  const handleReset = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    save([...defaultOrder]);
  };

  const renderItem = useCallback<SortableGridRenderItem<Id>>(
    ({ item, index }) => {
      const { icon, labelKey, hintKey } = buttons[item];
      const label = t(labelKey);
      return (
        <View style={styles.row} testID={`action-button-row-${item}`}>
          <Sortable.Handle>
            <View
              style={styles.handle}
              accessibilityLabel={t('actionButtons.dragHandle', { name: label })}
              testID={`action-button-handle-${item}`}
            >
              <AppIcon icon={DragDropVerticalIcon} size={22} color={COLORS.textSecondary} />
            </View>
          </Sortable.Handle>
          <View style={[styles.iconCircle, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}>
            <AppIcon icon={icon} size={20} color={accentColor} />
          </View>
          <View style={styles.labelGroup}>
            <Text style={styles.label} numberOfLines={2}>
              {label}
            </Text>
            {hintKey ? <Text style={styles.hint}>{t(hintKey)}</Text> : null}
          </View>
          <Text
            style={styles.position}
            accessibilityLabel={t('actionButtons.position', { position: index + 1 })}
          >
            {index + 1}
          </Text>
        </View>
      );
    },
    [accentColor, buttons, t]
  );

  const isDefault = isDefaultActionOrder(order, defaultOrder);

  return (
    <>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.list}>
        <Sortable.Grid
          columns={1}
          data={order}
          keyExtractor={(id) => id}
          renderItem={renderItem}
          rowGap={0}
          customHandle
          // Only the handle starts a drag, so it can start straight away. The default waits
          // 200ms and gives up if the finger moves first, so a normal grab-and-drag did nothing.
          dragActivationDelay={0}
          hapticsEnabled
          overDrag="none"
          onDragEnd={({ data }) => {
            if (data.some((id, index) => id !== order[index])) save(data);
          }}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
        onPress={handleReset}
        disabled={isDefault}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDefault }}
        testID="action-buttons-reset"
      >
        <Text style={[styles.resetText, { color: accentColor }, isDefault && styles.disabled]}>
          {t('homeCustomization.resetToDefault')}
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: SPACING.l,
  },
  tabs: {
    marginBottom: SPACING.l,
    marginHorizontal: SPACING.l,
  },
  description: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  // Full-width rows with no gaps, separated by hairlines, so labels get the whole width.
  list: {
    borderTopColor: COLORS.surfaceLight,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderBottomColor: COLORS.surfaceLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingRight: SPACING.m,
    paddingVertical: SPACING.s,
  },
  // A margin, not padding, keeps the whole grab area clear of the screen edge (and of Android's
  // back-swipe zone). The handle spaces itself so the icon and text keep their place.
  handle: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginLeft: SPACING.l,
    paddingLeft: SPACING.s,
    paddingRight: SPACING.xs,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    height: 40,
    justifyContent: 'center',
    marginRight: SPACING.m,
    width: 40,
  },
  labelGroup: {
    flex: 1,
    gap: 2,
    marginRight: SPACING.m,
  },
  label: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  hint: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
  },
  position: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
    minWidth: 16,
    textAlign: 'right',
  },
  resetButton: {
    alignItems: 'center',
    marginTop: SPACING.l,
    padding: SPACING.m,
  },
  resetText: {
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
