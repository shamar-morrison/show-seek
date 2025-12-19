import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import {
  AVAILABLE_TMDB_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '@/src/constants/homeScreenLists';
import { filterCustomLists, WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { MODAL_LIST_HEIGHT } from '@/src/constants/modalLayout';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { usePreferences, useUpdateHomeScreenLists } from '@/src/hooks/usePreferences';
import { HomeListType, HomeScreenListItem } from '@/src/types/preferences';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export interface HomeScreenCustomizationModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface HomeScreenCustomizationModalProps {
  onShowToast?: (message: string) => void;
}

interface ListItemProps {
  id: string;
  label: string;
  type: HomeListType;
  isSelected: boolean;
  onToggle: (item: HomeScreenListItem) => void;
}

const ListItem = ({ id, label, type, isSelected, onToggle }: ListItemProps) => {
  return (
    <Pressable style={styles.listItem} onPress={() => onToggle({ id, type, label })}>
      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
        <AnimatedCheck visible={isSelected} />
      </View>
      <Text style={styles.listName}>{label}</Text>
    </Pressable>
  );
};

const HomeScreenCustomizationModal = forwardRef<
  HomeScreenCustomizationModalRef,
  HomeScreenCustomizationModalProps
>(({ onShowToast }, ref) => {
  const sheetRef = useRef<TrueSheet>(null);
  const { homeScreenLists } = usePreferences();
  const { data: userLists } = useLists();
  const updateMutation = useUpdateHomeScreenLists();

  // Local state for pending selections (only persisted on Apply)
  const [pendingSelections, setPendingSelections] = useState<HomeScreenListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const customLists = userLists ? filterCustomLists(userLists) : [];

  const initializeSelections = useCallback(() => {
    setPendingSelections([...homeScreenLists]);
    setError(null);
  }, [homeScreenLists]);

  useImperativeHandle(ref, () => ({
    present: async () => {
      initializeSelections();
      await sheetRef.current?.present();
    },
    dismiss: async () => {
      await sheetRef.current?.dismiss();
    },
  }));

  const handleToggle = useCallback((item: HomeScreenListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);

    setPendingSelections((current) => {
      const isSelected = current.some((s) => s.id === item.id);

      if (isSelected) {
        if (current.length <= MIN_HOME_LISTS) {
          setError(`Select at least ${MIN_HOME_LISTS} list`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return current;
        }
        return current.filter((s) => s.id !== item.id);
      } else {
        if (current.length >= MAX_HOME_LISTS) {
          setError(`Select at most ${MAX_HOME_LISTS} lists`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return current;
        }
        return [...current, item];
      }
    });
  }, []);

  const handleApply = async () => {
    try {
      await updateMutation.mutateAsync(pendingSelections);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onShowToast?.('Home screen updated');
      sheetRef.current?.dismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCancel = () => {
    sheetRef.current?.dismiss();
  };

  const isSelected = (id: string) => pendingSelections.some((s) => s.id === id);

  return (
    <TrueSheet
      ref={sheetRef}
      detents={[0.8]}
      scrollable
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      grabber={true}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Customize Home Screen</Text>
          <Text style={styles.subtitle}>
            {pendingSelections.length}/{MAX_HOME_LISTS} selected
          </Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator
          nestedScrollEnabled={true}
        >
          {/* TMDB Lists Section */}
          <Text style={styles.sectionHeader}>TMDB Lists</Text>
          {AVAILABLE_TMDB_LISTS.map((list) => (
            <ListItem
              key={list.id}
              id={list.id}
              label={list.label}
              type="tmdb"
              isSelected={isSelected(list.id)}
              onToggle={handleToggle}
            />
          ))}

          {/* Watch Status Lists Section */}
          <Text style={styles.sectionHeader}>Watch Status</Text>
          {WATCH_STATUS_LISTS.map((list) => (
            <ListItem
              key={list.id}
              id={list.id}
              label={list.label}
              type="default"
              isSelected={isSelected(list.id)}
              onToggle={handleToggle}
            />
          ))}

          {/* Custom Lists Section */}
          {customLists.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Custom Lists</Text>
              {customLists.map((list) => (
                <ListItem
                  key={list.id}
                  id={list.id}
                  label={list.name}
                  type="custom"
                  isSelected={isSelected(list.id)}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={ACTIVE_OPACITY}
            disabled={updateMutation.isPending}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.applyButton, updateMutation.isPending && styles.disabledButton]}
            onPress={handleApply}
            activeOpacity={ACTIVE_OPACITY}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.applyButtonText}>Apply</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TrueSheet>
  );
});

HomeScreenCustomizationModal.displayName = 'HomeScreenCustomizationModal';

export default HomeScreenCustomizationModal;

const styles = StyleSheet.create({
  content: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  errorBanner: {
    backgroundColor: COLORS.error,
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.m,
  },
  errorText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  listContainer: {
    maxHeight: MODAL_LIST_HEIGHT,
    marginBottom: SPACING.m,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    marginRight: SPACING.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.m,
    justifyContent: 'flex-end',
    marginTop: SPACING.m,
  },
  cancelButton: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    minWidth: 80,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});
