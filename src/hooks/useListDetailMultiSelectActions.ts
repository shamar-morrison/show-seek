import { DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT } from '@/src/components/library/MultiSelectActionBar';
import { usePreferences } from '@/src/hooks/usePreferences';
import { ListMediaItem } from '@/src/services/ListService';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

type RequireAuth = (action: () => void | Promise<void>, message?: string) => void;

interface UseListDetailMultiSelectActionsParams {
  sourceListId?: string;
  sourceListName: string;
  selectedMediaItems: Array<Pick<ListMediaItem, 'id'>>;
  selectedCount: number;
  isSelectionMode: boolean;
  isRemoving: boolean;
  clearSelection: () => void;
  showToast: (message: string) => void;
  removeItemFromSource: (mediaId: number) => Promise<unknown>;
  requireAuth: RequireAuth;
  authPromptMessage: string;
  isAuthenticated?: boolean;
  guardBeforeConfirmation?: boolean;
  isSearchActive: boolean;
  deactivateSearch: () => void;
  dismissListActionsModal: () => void;
  insetsBottom: number;
}

export function useListDetailMultiSelectActions({
  sourceListId,
  sourceListName,
  selectedMediaItems,
  selectedCount,
  isSelectionMode,
  isRemoving,
  clearSelection,
  showToast,
  removeItemFromSource,
  requireAuth,
  authPromptMessage,
  isAuthenticated,
  guardBeforeConfirmation = false,
  isSearchActive,
  deactivateSearch,
  dismissListActionsModal,
  insetsBottom,
}: UseListDetailMultiSelectActionsParams) {
  const { preferences } = usePreferences();
  const { t } = useTranslation();
  const [actionBarHeight, setActionBarHeight] = useState<number | null>(null);

  const bulkAddMode = preferences.copyInsteadOfMove ? ('copy' as const) : ('move' as const);
  const bulkPrimaryLabel =
    bulkAddMode === 'copy' ? t('library.copyToLists') : t('library.moveToLists');

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
      dismissListActionsModal();
    }
  }, [dismissListActionsModal, isSelectionMode]);

  const handleRemoveSelectedItems = useCallback(() => {
    if (!sourceListId || selectedMediaItems.length === 0 || isRemoving) return;

    if (guardBeforeConfirmation && !isAuthenticated) {
      requireAuth(() => {}, authPromptMessage);
      return;
    }

    Alert.alert(
      t('library.removeItems'),
      t('library.removeItemsConfirm', { count: selectedCount, listName: sourceListName }),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('library.removeItems'),
          style: 'destructive',
          onPress: () => {
            requireAuth(
              async () => {
                let failed = 0;

                for (const item of selectedMediaItems) {
                  try {
                    await removeItemFromSource(item.id);
                  } catch {
                    failed += 1;
                  }
                }

                if (failed === 0) {
                  showToast(t('library.itemsRemoved', { count: selectedCount }));
                } else {
                  showToast(
                    t('library.changesFailedToSave', { failed, total: selectedMediaItems.length })
                  );
                }

                clearSelection();
              },
              authPromptMessage
            );
          },
        },
      ]
    );
  }, [
    authPromptMessage,
    clearSelection,
    guardBeforeConfirmation,
    isAuthenticated,
    isRemoving,
    removeItemFromSource,
    requireAuth,
    selectedCount,
    selectedMediaItems,
    showToast,
    sourceListId,
    sourceListName,
    t,
  ]);

  return {
    bulkAddMode,
    bulkPrimaryLabel,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleRemoveSelectedItems,
  };
}
