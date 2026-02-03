import React from 'react';
import { View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { EmptyState } from '@/src/components/library/EmptyState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';

interface RatingsEmptyStateProps {
  searchQuery: string;
  hasActiveFilterState: boolean;
  height: number;
  onClearFilters: (filters: typeof DEFAULT_WATCH_STATUS_FILTERS) => void;
}

export const RatingsEmptyState = ({
  searchQuery,
  hasActiveFilterState,
  height,
  onClearFilters,
}: RatingsEmptyStateProps) => {
  if (searchQuery) {
    return <SearchEmptyState height={height} />;
  }

  if (!hasActiveFilterState) {
    return null;
  }

  return (
    <View style={{ height }}>
      <EmptyState
        icon={SlidersHorizontal}
        title="No items match your filters"
        description="Try adjusting your filters to see more results."
        actionLabel="Clear Filters"
        onAction={() => onClearFilters(DEFAULT_WATCH_STATUS_FILTERS)}
      />
    </View>
  );
};
