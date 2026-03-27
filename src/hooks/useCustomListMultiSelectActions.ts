import { DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT } from '@/src/components/library/MultiSelectActionBar';
import { BulkDeleteListsResult } from '@/src/hooks/useLists';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

export interface BulkDeleteProgress {
  processed: number;
  total: number;
}

interface UseCustomListMultiSelectActionsParams {
  isSearchActive: boolean;
  deactivateSearch: () => void;
  insetsBottom: number;
  showToast: (message: string) => void;
  onNavigateToList: (listId: string) => void;
  deleteLists: (
    listIds: string[],
    onProgress: (processed: number, total: number) => void
  ) => Promise<BulkDeleteListsResult>;
  isDeleting: boolean;
}

export function useCustomListMultiSelectActions({
  isSearchActive,
  deactivateSearch,
  insetsBottom,
  showToast,
  onNavigateToList,
  deleteLists,
  isDeleting,
}: UseCustomListMultiSelectActionsParams) {
  const { t } = useTranslation();
  const [selectedListIds, setSelectedListIds] = useState<Record<string, true>>({});
  const [actionBarHeight, setActionBarHeight] = useState<number | null>(null);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<BulkDeleteProgress | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const selectedIds = useMemo(() => Object.keys(selectedListIds), [selectedListIds]);
  const selectedCount = selectedIds.length;
  const isSelectionMode = selectedCount > 0;

  const selectionContentBottomPadding = isSelectionMode
    ? (actionBarHeight ?? DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT + insetsBottom)
    : 0;

  useEffect(() => {
    if (isSelectionMode && isSearchActive) {
      deactivateSearch();
    }
  }, [deactivateSearch, isSearchActive, isSelectionMode]);

  const handleActionBarHeightChange = useCallback((height: number) => {
    setActionBarHeight((prevHeight) => (prevHeight === height ? prevHeight : height));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedListIds({});
  }, []);

  const toggleSelection = useCallback((listId: string) => {
    setSelectedListIds((prev) => {
      const next = { ...prev };

      if (next[listId]) {
        delete next[listId];
        return next;
      }

      next[listId] = true;
      return next;
    });
  }, []);

  const isListSelected = useCallback(
    (listId: string) => {
      return !!selectedListIds[listId];
    },
    [selectedListIds]
  );

  const handleListPress = useCallback(
    (listId: string) => {
      if (isBulkDeleting) {
        return;
      }

      if (isSelectionMode) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleSelection(listId);
        return;
      }

      onNavigateToList(listId);
    },
    [isBulkDeleting, isSelectionMode, onNavigateToList, toggleSelection]
  );

  const handleListLongPress = useCallback(
    (listId: string) => {
      if (isBulkDeleting) {
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleSelection(listId);
    },
    [isBulkDeleting, toggleSelection]
  );

  const handleDeleteSelectedLists = useCallback(() => {
    if (selectedIds.length === 0 || isDeleting || isBulkDeleting) {
      return;
    }

    Alert.alert(
      t('library.deleteListsTitle'),
      t('library.deleteListsConfirm', { count: selectedCount }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const total = selectedIds.length;

            setIsBulkDeleting(true);
            setBulkDeleteProgress({ processed: 0, total });

            try {
              const { deletedIds, failedIds } = await deleteLists(selectedIds, (processed, nextTotal) => {
                setBulkDeleteProgress({ processed, total: nextTotal });
              });

              if (failedIds.length === 0) {
                clearSelection();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showToast(t('library.listsDeleted', { count: deletedIds.length }));
                return;
              }

              setSelectedListIds(
                Object.fromEntries(failedIds.map((listId) => [listId, true])) as Record<string, true>
              );
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              showToast(t('library.changesFailedToSave', { failed: failedIds.length, total }));
            } catch (error) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('errors.deleteFailed')
              );
            } finally {
              setIsBulkDeleting(false);
              setBulkDeleteProgress(null);
            }
          },
        },
      ]
    );
  }, [
    clearSelection,
    deleteLists,
    isBulkDeleting,
    isDeleting,
    selectedCount,
    selectedIds,
    showToast,
    t,
  ]);

  return {
    handleListPress,
    handleListLongPress,
    selectedListIds: selectedIds,
    selectedCount,
    isSelectionMode,
    isListSelected,
    clearSelection,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleDeleteSelectedLists,
    bulkDeleteProgress,
    isBulkDeleting,
  };
}
