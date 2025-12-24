import { Search } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';

interface ActionButton {
  icon: React.ComponentType<{ size: number; color: string }>;
  onPress: () => void;
  showBadge?: boolean;
}

interface UseHeaderSearchOptions<T> {
  /** The items to filter */
  items: T[];
  /** Function to extract searchable text from an item */
  getSearchableText: (item: T) => string;
  /** Debounce delay in ms (not implemented yet for simplicity) */
  debounceMs?: number;
}

interface UseHeaderSearchReturn<T> {
  /** Current search query */
  searchQuery: string;
  /** Whether search mode is active */
  isSearchActive: boolean;
  /** Items filtered by search query */
  filteredItems: T[];
  /** Activate search mode (shows search bar) */
  activateSearch: () => void;
  /** Deactivate search mode (hides search bar, clears query) */
  deactivateSearch: () => void;
  /** Update search query */
  setSearchQuery: (query: string) => void;
  /** Search button config to pass to useViewModeToggle */
  searchButton: ActionButton;
}

/**
 * Hook for managing search state in library screens.
 * Returns filtered items and a search button to add to the header.
 *
 * @example
 * ```tsx
 * const { filteredItems, searchButton, isSearchActive, ... } = useHeaderSearch({
 *   items: data,
 *   getSearchableText: (item) => item.title || item.name || '',
 * });
 *
 * // Pass searchButton to useViewModeToggle
 * // Use filteredItems in your list
 * // When isSearchActive, render SearchableHeader via navigation.setOptions
 * ```
 */
export function useHeaderSearch<T>({
  items,
  getSearchableText,
}: UseHeaderSearchOptions<T>): UseHeaderSearchReturn<T> {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  const activateSearch = useCallback(() => {
    setIsSearchActive(true);
  }, []);

  const deactivateSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
  }, []);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const query = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const text = getSearchableText(item).toLowerCase();
      return text.includes(query);
    });
  }, [items, searchQuery, getSearchableText]);

  // Search button configuration for header
  const searchButton: ActionButton = useMemo(
    () => ({
      icon: Search,
      onPress: activateSearch,
      showBadge: searchQuery.length > 0,
    }),
    [activateSearch, searchQuery.length]
  );

  return {
    searchQuery,
    isSearchActive,
    filteredItems,
    activateSearch,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  };
}
