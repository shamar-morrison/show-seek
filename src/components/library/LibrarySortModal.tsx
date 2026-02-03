import React from 'react';
import MediaSortModal, { SortOption, SortState } from '@/src/components/MediaSortModal';

interface LibrarySortModalProps {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  sortState: SortState;
  onApplySort: (sortState: SortState) => void;
  showUserRatingOption?: boolean;
  allowedOptions?: SortOption[];
}

export function LibrarySortModal({
  visible,
  setVisible,
  sortState,
  onApplySort,
  showUserRatingOption,
  allowedOptions,
}: LibrarySortModalProps) {
  return (
    <MediaSortModal
      visible={visible}
      onClose={() => setVisible(false)}
      sortState={sortState}
      onApplySort={onApplySort}
      showUserRatingOption={showUserRatingOption}
      allowedOptions={allowedOptions}
    />
  );
}
