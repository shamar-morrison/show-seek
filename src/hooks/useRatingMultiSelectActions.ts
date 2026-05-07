import { DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT } from '@/src/components/library/MultiSelectActionBar';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

export interface BulkRemoveProgress {
  processed: number;
  total: number;
}

export type RatingMultiSelectTarget =
  | {
      id: string;
      mediaType: 'movie';
      mediaId: number;
    }
  | {
      id: string;
      mediaType: 'tv';
      mediaId: number;
    }
  | {
      id: string;
      mediaType: 'episode';
      tvShowId: number;
      seasonNumber: number;
      episodeNumber: number;
    }
  | {
      id: string;
      mediaType: 'season';
      tvShowId: number;
      seasonNumber: number;
    };

interface UseRatingMultiSelectActionsOptions<TItem, TTarget extends RatingMultiSelectTarget> {
  isLoading: boolean;
  isRemoving: boolean;
  getSelectionTarget: (item: TItem) => TTarget | null;
  onNavigate: (item: TItem) => void;
  showToast: (message: string) => void;
  removeRating: (target: TTarget) => Promise<unknown>;
  isSearchActive: boolean;
  deactivateSearch: () => void;
  dismissListActionsModal?: () => void;
  insetsBottom: number;
}

export function useRatingMultiSelectActions<TItem, TTarget extends RatingMultiSelectTarget>({
  isLoading,
  isRemoving,
  getSelectionTarget,
  onNavigate,
  showToast,
  removeRating,
  isSearchActive,
  deactivateSearch,
  dismissListActionsModal,
  insetsBottom,
}: UseRatingMultiSelectActionsOptions<TItem, TTarget>) {
  const { t } = useTranslation();
  const [selectedTargets, setSelectedTargets] = useState<Record<string, TTarget>>({});
  const [actionBarHeight, setActionBarHeight] = useState<number | null>(null);
  const [bulkRemoveProgress, setBulkRemoveProgress] = useState<BulkRemoveProgress | null>(null);
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);

  const toggleSelection = useCallback((target: TTarget) => {
    setSelectedTargets((prev) => {
      const next = { ...prev };

      if (next[target.id]) {
        delete next[target.id];
        return next;
      }

      next[target.id] = target;
      return next;
    });
  }, []);

  const selectedRatingTargets = useMemo(() => Object.values(selectedTargets), [selectedTargets]);
  const selectedCount = selectedRatingTargets.length;
  const isSelectionMode = selectedCount > 0;

  const handleItemPress = useCallback(
    (item: TItem) => {
      if (isSelectionMode) {
        const target = getSelectionTarget(item);
        if (!target) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleSelection(target);
        return;
      }

      onNavigate(item);
    },
    [getSelectionTarget, isSelectionMode, onNavigate, toggleSelection]
  );

  const handleLongPress = useCallback(
    (item: TItem) => {
      if (isLoading) return;

      const target = getSelectionTarget(item);
      if (!target) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleSelection(target);
    },
    [getSelectionTarget, isLoading, toggleSelection]
  );

  const isItemSelected = useCallback(
    (item: TItem) => {
      const target = getSelectionTarget(item);
      return target ? !!selectedTargets[target.id] : false;
    },
    [getSelectionTarget, selectedTargets]
  );

  const clearSelection = useCallback(() => {
    setSelectedTargets({});
  }, []);

  const handleActionBarHeightChange = useCallback((height: number) => {
    setActionBarHeight((prevHeight) => (prevHeight === height ? prevHeight : height));
  }, []);

  const selectionContentBottomPadding = isSelectionMode
    ? (actionBarHeight ?? (DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT + insetsBottom))
    : 0;

  useEffect(() => {
    if (isSelectionMode && isSearchActive) {
      deactivateSearch();
    }
  }, [deactivateSearch, isSearchActive, isSelectionMode]);

  useEffect(() => {
    if (isSelectionMode) {
      dismissListActionsModal?.();
    }
  }, [dismissListActionsModal, isSelectionMode]);

  const handleRemoveSelectedItems = useCallback(() => {
    if (selectedRatingTargets.length === 0 || isRemoving || isBulkRemoving) return;

    Alert.alert(t('library.removeRatings'), t('library.removeRatingsConfirm', { count: selectedCount }), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('library.removeRatings'),
        style: 'destructive',
        onPress: async () => {
          const total = selectedRatingTargets.length;
          const failedTargets: TTarget[] = [];
          let failed = 0;
          let processed = 0;

          setIsBulkRemoving(true);
          setBulkRemoveProgress({ processed: 0, total });

          try {
            for (const target of selectedRatingTargets) {
              try {
                await removeRating(target);
              } catch {
                failed += 1;
                failedTargets.push(target);
              } finally {
                processed += 1;
                setBulkRemoveProgress({ processed, total });
              }
            }

            if (failed === 0) {
              showToast(t('library.ratingsRemoved', { count: total }));
            } else {
              showToast(t('library.changesFailedToSave', { failed, total }));
            }
          } finally {
            if (failedTargets.length === 0) {
              clearSelection();
            } else {
              setSelectedTargets(
                Object.fromEntries(failedTargets.map((target) => [target.id, target])) as Record<
                  string,
                  TTarget
                >
              );
            }
            setIsBulkRemoving(false);
            setBulkRemoveProgress(null);
          }
        },
      },
    ]);
  }, [
    clearSelection,
    isBulkRemoving,
    isRemoving,
    removeRating,
    selectedCount,
    selectedRatingTargets,
    showToast,
    t,
  ]);

  return {
    handleItemPress,
    handleLongPress,
    selectedCount,
    isSelectionMode,
    isItemSelected,
    clearSelection,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleRemoveSelectedItems,
    bulkRemoveProgress,
    isBulkRemoving,
  };
}
