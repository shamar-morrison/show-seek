import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import { COLORS } from '@/src/constants/theme';
import { iconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, Grid3X3, List } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export type ViewMode = 'grid' | 'list';

interface ActionButton {
  /** Icon component to display */
  icon: React.ComponentType<{ size: number; color: string }>;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether to show an active indicator badge */
  showBadge?: boolean;
}

/** Search state to enable header swap for search mode */
interface SearchState {
  /** Whether search is currently active */
  isActive: boolean;
  /** Current search query */
  query: string;
  /** Callback to update search query */
  onQueryChange: (query: string) => void;
  /** Callback when search is closed */
  onClose: () => void;
  /** Placeholder text for search input */
  placeholder?: string;
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
  /** Search state - when provided, the hook handles search header swap */
  searchState?: SearchState;
}

interface UseViewModeToggleReturn {
  viewMode: ViewMode;
  isLoadingPreference: boolean;
  toggleViewMode: () => Promise<void>;
}

/**
 * Custom hook for managing view mode (grid/list) toggle with persistence.
 * Also sets up the header with view toggle and optional sort button.
 * When searchState is provided, handles switching between search header and normal header.
 */
export function useViewModeToggle({
  storageKey,
  showSortButton = true,
  hasActiveSort = false,
  onSortPress,
  actionButton,
  searchButton,
  searchState,
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
  // Also handles search header swap when searchState is provided
  useLayoutEffect(() => {
    if (searchState?.isActive) {
      // Show search header
      navigation.setOptions({
        headerTitle: () => null,
        headerRight: () => null,
        header: () => (
          <SearchableHeader
            searchQuery={searchState.query}
            onSearchChange={searchState.onQueryChange}
            onClose={searchState.onClose}
            placeholder={searchState.placeholder}
          />
        ),
      });
    } else {
      // Show normal header with buttons
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            {searchButton && (
              <HeaderIconButton onPress={searchButton.onPress}>
                <searchButton.icon size={22} color={COLORS.text} />
              </HeaderIconButton>
            )}
            <HeaderIconButton onPress={toggleViewMode}>
              {viewMode === 'grid' ? (
                <List size={24} color={COLORS.text} />
              ) : (
                <Grid3X3 size={24} color={COLORS.text} />
              )}
            </HeaderIconButton>
            {showSortButton && onSortPress && (
              <HeaderIconButton onPress={onSortPress}>
                <View style={iconBadgeStyles.wrapper}>
                  <ArrowUpDown size={22} color={COLORS.text} />
                  {hasActiveSort && <View style={iconBadgeStyles.badge} />}
                </View>
              </HeaderIconButton>
            )}
            {actionButton && (
              <HeaderIconButton onPress={actionButton.onPress}>
                <View style={iconBadgeStyles.wrapper}>
                  <actionButton.icon size={22} color={COLORS.text} />
                  {actionButton.showBadge && <View style={iconBadgeStyles.badge} />}
                </View>
              </HeaderIconButton>
            )}
          </View>
        ),
      });
    }
  }, [
    navigation,
    viewMode,
    toggleViewMode,
    showSortButton,
    hasActiveSort,
    onSortPress,
    actionButton,
    searchButton,
    searchState,
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
  },
});
