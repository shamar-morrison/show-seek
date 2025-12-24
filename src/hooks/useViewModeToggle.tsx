import { ACTIVE_OPACITY, COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { sortHeaderStyles } from '@/src/hooks/useRatingSorting';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, Grid3X3, List } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export type ViewMode = 'grid' | 'list';

interface ActionButton {
  /** Icon component to display */
  icon: React.ComponentType<{ size: number; color: string }>;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether to show an active indicator badge */
  showBadge?: boolean;
}

interface UseViewModeToggleOptions {
  /** Unique storage key for persisting the view mode preference */
  storageKey: string;
  /** Whether to show the sort button in the header */
  showSortButton?: boolean;
  /** Whether the sort is active (shows badge on sort button) */
  hasActiveSort?: boolean;
  /** Callback when sort button is pressed */
  onSortPress?: () => void;
  /** Custom action button to show instead of/alongside sort button */
  actionButton?: ActionButton;
  /** Search button to show in header (renders first, before view toggle) */
  searchButton?: ActionButton;
}

interface UseViewModeToggleReturn {
  viewMode: ViewMode;
  isLoadingPreference: boolean;
  toggleViewMode: () => Promise<void>;
}

/**
 * Custom hook for managing view mode (grid/list) toggle with persistence.
 * Also sets up the header with view toggle and optional sort button.
 */
export function useViewModeToggle({
  storageKey,
  showSortButton = true,
  hasActiveSort = false,
  onSortPress,
  actionButton,
  searchButton,
}: UseViewModeToggleOptions): UseViewModeToggleReturn {
  const navigation = useNavigation();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Load view mode preference
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved);
        }
      } catch (error) {
        console.error('Failed to load view mode preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, [storageKey]);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(storageKey, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode, storageKey]);

  // Set up header with view mode toggle and optional sort/action button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          {searchButton && (
            <TouchableOpacity
              onPress={searchButton.onPress}
              activeOpacity={ACTIVE_OPACITY}
              hitSlop={HIT_SLOP.m}
            >
              <searchButton.icon size={22} color={COLORS.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={toggleViewMode}
            activeOpacity={ACTIVE_OPACITY}
            hitSlop={HIT_SLOP.m}
          >
            {viewMode === 'grid' ? (
              <List size={24} color={COLORS.text} />
            ) : (
              <Grid3X3 size={24} color={COLORS.text} />
            )}
          </TouchableOpacity>
          {showSortButton && onSortPress && (
            <TouchableOpacity
              onPress={onSortPress}
              activeOpacity={ACTIVE_OPACITY}
              style={sortHeaderStyles.headerButton}
              hitSlop={HIT_SLOP.m}
            >
              <ArrowUpDown size={22} color={COLORS.text} />
              {hasActiveSort && <View style={sortHeaderStyles.sortBadge} />}
            </TouchableOpacity>
          )}
          {actionButton && (
            <TouchableOpacity
              onPress={actionButton.onPress}
              activeOpacity={ACTIVE_OPACITY}
              style={sortHeaderStyles.headerButton}
              hitSlop={HIT_SLOP.m}
            >
              <actionButton.icon size={22} color={COLORS.text} />
              {actionButton.showBadge && <View style={sortHeaderStyles.sortBadge} />}
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [
    navigation,
    viewMode,
    toggleViewMode,
    showSortButton,
    hasActiveSort,
    onSortPress,
    actionButton,
    searchButton,
  ]);

  return {
    viewMode,
    isLoadingPreference,
    toggleViewMode,
  };
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
});
