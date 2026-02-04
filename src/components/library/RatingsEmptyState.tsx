import React from 'react';
import { View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import { EmptyState } from '@/src/components/library/EmptyState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

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
        title={t('discover.noResultsWithFilters')}
        description={t('discover.adjustFilters')}
        actionLabel={t('common.reset')}
        onAction={() => onClearFilters(DEFAULT_WATCH_STATUS_FILTERS)}
      />
    </View>
  );
};
