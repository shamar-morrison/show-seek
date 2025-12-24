import { Search } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  /** Debounce delay in ms. Defaults to 0 (no debounce). */
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
 *   debounceMs: 300, // Optional: debounce filtering by 300ms
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
  debounceMs = 0,
}: UseHeaderSearchOptions<T>): UseHeaderSearchReturn<T> {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Debounce the search query
  useEffect(() => {
    if (debounceMs === 0) {
      setDebouncedQuery(searchQuery);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [searchQuery, debounceMs]);

  const activateSearch = useCallback(() => {
    setIsSearchActive(true);
  }, []);

  const deactivateSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
    setDebouncedQuery('');
  }, []);

  // Filter items based on debounced search query
  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return items;
    }

    const query = debouncedQuery.toLowerCase().trim();
    return items.filter((item) => {
      const text = getSearchableText(item).toLowerCase();
      return text.includes(query);
    });
  }, [items, debouncedQuery, getSearchableText]);

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
