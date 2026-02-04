import { SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Movie, TVShow } from '../api/tmdb';
import { ListActionsIcon, ListActionsModalRef } from '../components/ListActionsModal';
import { DEFAULT_SORT_STATE, SortState } from '../components/MediaSortModal';
import { createSortAction } from '../utils/listActions';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterRatingItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '../utils/listFilters';
import { useAllGenres } from './useGenres';
import { createRatingSorter } from './useRatingSorting';
import { useViewModeToggle } from './useViewModeToggle';

/**
 * Base interface for enriched rating items.
 * Must match the RatingItem interface used by createRatingSorter.
 */
export interface BaseEnrichedRating {
  rating: { id: string; rating: number; ratedAt: number };
}

/**
 * List action item configuration
 */
export interface RatingListAction {
  id: string;
  icon: typeof SlidersHorizontal;
  label: string;
  onPress: () => void;
  showBadge?: boolean;
}

/**
 * Configuration options for the useRatingScreenLogic hook
 */
export interface UseRatingScreenLogicOptions<TItem extends BaseEnrichedRating> {
  /** Unique storage key for view mode preference */
  storageKey: string;
  /** The enriched rating items data */
  data: TItem[] | undefined;
  /** Function to extract the media object from a rating item */
  getMediaFromItem: (item: TItem) => Movie | TVShow | null;
  /** Optional search button to display in header */
  searchButton?: {
    icon: React.ComponentType<{ size: number; color: string }>;
    onPress: () => void;
    showBadge?: boolean;
  };
  /** Optional search state for header swap */
  searchState?: {
    isActive: boolean;
    query: string;
    onQueryChange: (query: string) => void;
    onClose: () => void;
    placeholder?: string;
  };
}

/**
 * Return type for the useRatingScreenLogic hook
 */
export interface UseRatingScreenLogicReturn<TItem extends BaseEnrichedRating> {
  // State
  sortState: SortState;
  filterState: WatchStatusFilterState;
  sortModalVisible: boolean;
  filterModalVisible: boolean;
  hasActiveSort: boolean;
  hasActiveFilterState: boolean;

  // View mode
  viewMode: 'grid' | 'list';
  isLoadingPreference: boolean;

  // Refs
  listRef: React.RefObject<any>;
  listActionsModalRef: React.RefObject<ListActionsModalRef | null>;

  // Handlers
  setSortModalVisible: (visible: boolean) => void;
  setFilterModalVisible: (visible: boolean) => void;
  setFilterState: (filters: WatchStatusFilterState) => void;
  handleApplySort: (newSortState: SortState) => void;
  clearFilters: () => void;

  // Computed
  listActions: RatingListAction[];
  sortedData: TItem[];
  genreMap: Record<number, string>;
}

/**
 * Custom hook that encapsulates shared logic for movie and TV show rating screens.
 *
 * This hook manages:
 * - Sort/filter state
 * - View mode toggle integration
 * - Scroll-to-top on state changes
 * - List actions configuration
 * - Data filtering and sorting
 *
 * @param options Configuration options for the hook
 * @returns Shared state, handlers, and computed values for rating screens
 */
export function useRatingScreenLogic<TItem extends BaseEnrichedRating>({
  storageKey,
  data,
  getMediaFromItem,
  searchButton,
  searchState,
}: UseRatingScreenLogicOptions<TItem>): UseRatingScreenLogicReturn<TItem> {
  const { t } = useTranslation();

  // Sort state
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );

  // Refs
  const listRef = useRef<any>(null);
  const listActionsModalRef = useRef<ListActionsModalRef>(null);
  const isInitialMount = useRef(true);

  // Fetch genre data for filter modal
  const { data: genreMap = {} } = useAllGenres();

  // Computed filter/sort status
  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const hasActiveFilterState = hasActiveFilters(filterState);

  // Action button for view mode toggle header
  const actionButton = useMemo(
    () => ({
      icon: ListActionsIcon,
      onPress: () => listActionsModalRef.current?.present(),
      showBadge: hasActiveSort || hasActiveFilterState,
    }),
    [hasActiveSort, hasActiveFilterState]
  );

  // View mode toggle integration
  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey,
    showSortButton: false,
    actionButton,
    searchButton,
    searchState,
  });

  // Scroll to top after sort/filter state changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [sortState, filterState]);

  // Handlers
  const handleApplySort = useCallback((newSortState: SortState) => {
    setSortState(newSortState);
  }, []);

  const clearFilters = useCallback(() => {
    setFilterState(DEFAULT_WATCH_STATUS_FILTERS);
  }, []);

  // List actions for the modal
  const listActions = useMemo(
    () => [
      {
        id: 'filter',
        icon: SlidersHorizontal,
        label: t('library.filterItems'),
        onPress: () => setFilterModalVisible(true),
        showBadge: hasActiveFilterState,
      },
      createSortAction({
        onPress: () => setSortModalVisible(true),
        showBadge: hasActiveSort,
      }),
    ],
    [hasActiveFilterState, hasActiveSort, t]
  );

  // Filter and sort data
  const sortedData = useMemo(() => {
    if (!data) return [];

    // First filter out items with null media, then apply filters
    const validItems = [...data].filter((item) => getMediaFromItem(item) !== null);
    const filtered = filterRatingItems(validItems, filterState, getMediaFromItem);

    // Then apply sorting
    const sorter = createRatingSorter<TItem>(getMediaFromItem, sortState);
    return filtered.sort(sorter);
  }, [data, sortState, filterState, getMediaFromItem]);

  return {
    // State
    sortState,
    filterState,
    sortModalVisible,
    filterModalVisible,
    hasActiveSort,
    hasActiveFilterState,

    // View mode
    viewMode,
    isLoadingPreference,

    // Refs
    listRef,
    listActionsModalRef,

    // Handlers
    setSortModalVisible,
    setFilterModalVisible,
    setFilterState,
    handleApplySort,
    clearFilters,

    // Computed
    listActions,
    sortedData,
    genreMap,
  };
}
