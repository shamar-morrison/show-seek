import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { isDefaultList } from '@/src/constants/lists';
import { MODAL_LIST_HEIGHT } from '@/src/constants/modalLayout';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { useAddToList, useDeleteList, useLists, useRemoveFromList } from '@/src/hooks/useLists';
import { ListMediaItem, UserList } from '@/src/services/ListService';
import { getListIconComponent } from '@/src/utils/listIcons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Check, Plus, Settings2 } from 'lucide-react-native';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface AddToListModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface AddToListModalProps {
  mediaItem?: Omit<ListMediaItem, 'addedAt'>;
  mediaItems?: Omit<ListMediaItem, 'addedAt'>[];
  sourceListId?: string;
  bulkAddMode?: 'move' | 'copy';
  onShowToast?: (message: string) => void;
  onComplete?: () => void;
}

// Pre-computed list item with cached item count
interface ListWithCount extends UserList {
  itemCount: number;
}

// Memoized list item row component to prevent re-renders
const ListItemRow = memo<{
  list: ListWithCount;
  isSelected: boolean;
  isSaving: boolean;
  onToggle: (listId: string) => void;
  onDelete: (listId: string, listName: string) => void;
  allowDelete?: boolean;
}>(
  ({ list, isSelected, isSaving, onToggle, onDelete, allowDelete = true }) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const handlePress = useCallback(() => onToggle(list.id), [list.id, onToggle]);
    const handleLongPress = useCallback(() => {
      if (!allowDelete) return;
      onDelete(list.id, list.name);
    }, [allowDelete, list.id, list.name, onDelete]);

    const ListIcon = getListIconComponent(list.id);

    return (
      <Pressable
        style={styles.listItem}
        onPress={handlePress}
        onLongPress={handleLongPress}
        disabled={isSaving}
        testID={`add-to-list-row-${list.id}`}
      >
        <View
          style={[
            styles.checkbox,
            isSelected && { backgroundColor: accentColor, borderColor: accentColor },
          ]}
        >
          <AnimatedCheck visible={isSelected} />
        </View>
        <View style={styles.listIcon}>
          <ListIcon size={20} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.listName}>{list.name}</Text>
        <Text style={styles.itemCount}>
          {list.itemCount} {t('common.item', { count: list.itemCount })}
        </Text>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.list.id === next.list.id &&
    prev.list.itemCount === next.list.itemCount &&
    prev.isSelected === next.isSelected &&
    prev.isSaving === next.isSaving &&
    prev.allowDelete === next.allowDelete
);

ListItemRow.displayName = 'ListItemRow';

const AddToListModal = forwardRef<AddToListModalRef, AddToListModalProps>(
  (
    { mediaItem, mediaItems, sourceListId, bulkAddMode = 'move', onShowToast, onComplete },
    ref
  ) => {
    const router = useRouter();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const { user } = useAuth();
    const userId = user?.uid;
    const queryClient = useQueryClient();
    const sheetRef = useRef<TrueSheet>(null);
    const listRef = useRef<FlatList<ListWithCount>>(null);
    const createListModalRef = useRef<CreateListModalRef>(null);
    const { width } = useWindowDimensions();
    const [operationError, setOperationError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const bulkMediaItems = mediaItems ?? [];
    const isBulkMode = !!sourceListId && bulkMediaItems.length > 0;
    const bulkHeaderTitle =
      isBulkMode && bulkAddMode === 'copy'
        ? t('library.copyToLists')
        : isBulkMode
          ? t('library.moveToLists')
          : t('media.addToList');

    // Local state to track pending selections (toggled independently of Firebase)
    const [pendingSelections, setPendingSelections] = useState<Record<string, boolean>>({});
    // Stable snapshot of membership at modal open time (not reactive)
    const initialMembershipRef = useRef<Record<string, boolean>>({});
    // Flag to preserve state when temporarily dismissing for create list flow
    const isTransitioningToCreateRef = useRef(false);
    // Track lifecycle semantics across a modal session
    const wasBulkSessionRef = useRef(false);
    const didCompleteRef = useRef(false);

    useEffect(() => {
      if (operationError) {
        const timer = setTimeout(() => {
          setOperationError(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [operationError]);

    useEffect(() => {
      if (successMessage) {
        const timer = setTimeout(() => {
          setSuccessMessage(null);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }, [successMessage]);

    const { data: lists, isLoading: isLoadingLists, error: listsError } = useLists();

    const addMutation = useAddToList();
    const removeMutation = useRemoveFromList();
    const deleteMutation = useDeleteList();

    const reconcileListQueries = useCallback(async () => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['lists', userId],
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          refetchType: 'active',
        }),
      ]);
    }, [queryClient, userId]);

    const singleMembership = useMemo<Record<string, boolean>>(() => {
      if (isBulkMode || !mediaItem || !lists) return {};

      const membership: Record<string, boolean> = {};
      lists.forEach((list) => {
        if (list.items && list.items[mediaItem.id]) {
          membership[list.id] = true;
        }
      });

      return membership;
    }, [isBulkMode, lists, mediaItem]);

    // Pre-compute item counts once when lists change (not on every render)
    const listsWithCounts = useMemo<ListWithCount[]>(() => {
      if (!lists) return [];

      const filteredLists =
        isBulkMode && sourceListId ? lists.filter((list) => list.id !== sourceListId) : lists;

      return filteredLists.map((list) => ({
        ...list,
        itemCount: list.items ? Object.keys(list.items).length : 0,
      }));
    }, [isBulkMode, lists, sourceListId]);

    // Check if there are unsaved changes
    const hasChanges = useMemo(() => {
      if (isBulkMode) {
        return Object.values(pendingSelections).some(Boolean);
      }

      return Object.keys(pendingSelections).some((listId) => {
        const originalMembership = !!initialMembershipRef.current[listId];
        return pendingSelections[listId] !== originalMembership;
      });
    }, [isBulkMode, pendingSelections]);

    useImperativeHandle(ref, () => ({
      present: async () => {
        wasBulkSessionRef.current = isBulkMode;
        didCompleteRef.current = false;

        if (isBulkMode) {
          initialMembershipRef.current = {};
          setPendingSelections({});
        } else {
          initialMembershipRef.current = { ...singleMembership };
          setPendingSelections({ ...singleMembership });
        }

        setSuccessMessage(null);
        setOperationError(null);
        setIsSaving(false);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleDismiss = useCallback(() => {
      // Don't reset state if we're transitioning to the create list modal
      if (isTransitioningToCreateRef.current) {
        isTransitioningToCreateRef.current = false;
        return;
      }
      // Reset pending selections on dismiss (discard changes silently)
      setPendingSelections({});
      initialMembershipRef.current = {};
      setOperationError(null);
      setIsSaving(false);

      // For bulk mode sessions, dismissing the modal is treated as ending the selection flow.
      // For non-bulk sessions, only fire completion callback after successful save.
      if (didCompleteRef.current || wasBulkSessionRef.current) {
        onComplete?.();
      }

      didCompleteRef.current = false;
      wasBulkSessionRef.current = false;
    }, [onComplete]);

    // Error handler for mutations
    const handleMutationError = useCallback(
      (error: Error) => {
        console.error('List operation failed:', error);

        if (error.message.includes('LimitReached')) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            t('library.limitReachedTitle'),
            `${error.message}\n\n${t('library.limitReachedUpgradeMessage')}`,
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('profile.upgradeToPremium'),
                style: 'default',
                onPress: () => {
                  sheetRef.current?.dismiss();
                  router.push('/premium');
                },
              },
            ]
          );
          // Don't set operation error text if we show alert, to avoid clutter
          return;
        }

        setOperationError(error.message || t('errors.saveFailed'));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
      [router, t]
    );

    // Toggle local state only (no Firebase operations)
    const handleToggleList = (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setOperationError(null);

      setPendingSelections((prev) => ({
        ...prev,
        [listId]: !prev[listId],
      }));
    };

    const handleSingleSave = useCallback(async () => {
      if (!mediaItem || !listsWithCounts.length) return;

      const changedLists = listsWithCounts.filter((list) => {
        const wasInList = !!initialMembershipRef.current[list.id];
        const isNowInList = !!pendingSelections[list.id];
        return wasInList !== isNowInList;
      });

      if (changedLists.length === 0) {
        await sheetRef.current?.dismiss();
        return;
      }

      setIsSaving(true);
      setOperationError(null);

      let totalOperations = 0;
      let failedOperations = 0;
      let firstError: Error | null = null;

      for (const list of changedLists) {
        const wasInList = !!initialMembershipRef.current[list.id];
        const isNowInList = !!pendingSelections[list.id];

        if (wasInList && !isNowInList) {
          totalOperations++;
          try {
            await removeMutation.mutateAsync({ listId: list.id, mediaId: mediaItem.id });
          } catch (error) {
            failedOperations++;
            if (!firstError) {
              firstError = error instanceof Error ? error : new Error(t('errors.saveFailed'));
            }
          }
        } else if (!wasInList && isNowInList) {
          totalOperations++;
          try {
            await addMutation.mutateAsync({ listId: list.id, mediaItem, listName: list.name });
          } catch (error) {
            failedOperations++;
            if (!firstError) {
              firstError = error instanceof Error ? error : new Error(t('errors.saveFailed'));
            }
          }
        }
      }

      await reconcileListQueries();

      if (failedOperations === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (onShowToast) {
          onShowToast(t('library.listsUpdated'));
        }
        didCompleteRef.current = true;
        await sheetRef.current?.dismiss();
      } else if (failedOperations < totalOperations) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setOperationError(
          t('library.changesFailedToSave', { failed: failedOperations, total: totalOperations })
        );
        setIsSaving(false);
      } else {
        handleMutationError(firstError ?? new Error(t('errors.saveFailed')));
        setIsSaving(false);
      }
    }, [
      addMutation,
      handleMutationError,
      listsWithCounts,
      mediaItem,
      onShowToast,
      pendingSelections,
      reconcileListQueries,
      removeMutation,
      t,
    ]);

    const handleBulkSave = useCallback(async () => {
      if (!sourceListId || bulkMediaItems.length === 0 || !listsWithCounts.length) return;

      const targetLists = listsWithCounts.filter((list) => !!pendingSelections[list.id]);
      if (targetLists.length === 0) return;

      setIsSaving(true);
      setOperationError(null);

      let totalOperations = 0;
      let failedOperations = 0;
      let firstError: Error | null = null;

      for (const selectedMedia of bulkMediaItems) {
        let itemHadAddFailure = false;

        for (const targetList of targetLists) {
          const alreadyInTargetList = !!targetList.items?.[selectedMedia.id];
          if (alreadyInTargetList) continue;

          totalOperations++;

          try {
            await addMutation.mutateAsync({
              listId: targetList.id,
              mediaItem: selectedMedia,
              listName: targetList.name,
            });
          } catch (error) {
            failedOperations++;
            itemHadAddFailure = true;
            if (!firstError) {
              firstError = error instanceof Error ? error : new Error(t('errors.saveFailed'));
            }
          }
        }

        if (itemHadAddFailure) {
          continue;
        }

        if (bulkAddMode === 'copy') {
          continue;
        }

        totalOperations++;

        try {
          await removeMutation.mutateAsync({ listId: sourceListId, mediaId: selectedMedia.id });
        } catch (error) {
          failedOperations++;
          if (!firstError) {
            firstError = error instanceof Error ? error : new Error(t('errors.saveFailed'));
          }
        }
      }

      await reconcileListQueries();

      if (failedOperations === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onShowToast?.(t('library.listsUpdated'));
        didCompleteRef.current = true;
        await sheetRef.current?.dismiss();
        return;
      }

      if (failedOperations < totalOperations) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setOperationError(
          t('library.changesFailedToSave', { failed: failedOperations, total: totalOperations })
        );
        setIsSaving(false);
        return;
      }

      handleMutationError(firstError ?? new Error(t('errors.saveFailed')));
      setIsSaving(false);
    }, [
      addMutation,
      bulkAddMode,
      bulkMediaItems,
      handleMutationError,
      listsWithCounts,
      onShowToast,
      pendingSelections,
      reconcileListQueries,
      removeMutation,
      sourceListId,
      t,
    ]);

    const handleSave = useCallback(async () => {
      if (isBulkMode) {
        await handleBulkSave();
        return;
      }

      await handleSingleSave();
    }, [handleBulkSave, handleSingleSave, isBulkMode]);

    const handleDeleteList = (listId: string, listName: string) => {
      if (isDefaultList(listId)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(t('library.cannotDeleteTitle'), t('library.cannotDeleteDefaultLists'), [
          { text: t('common.ok') },
        ]);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        t('library.deleteList'),
        t('library.deleteListConfirmMessage', { listName }),
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMutation.mutateAsync(listId);
                setPendingSelections((prev) => {
                  const updated = { ...prev };
                  delete updated[listId];
                  return updated;
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (onShowToast) {
                  onShowToast(t('library.listDeleted'));
                }
              } catch (error) {
                console.error('Failed to delete list:', error);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(
                  t('common.error'),
                  error instanceof Error ? error.message : t('errors.deleteFailed')
                );
              }
            },
          },
        ]
      );
    };

    const handleCreateCustomListPress = async () => {
      isTransitioningToCreateRef.current = true;
      await sheetRef.current?.dismiss();
      await createListModalRef.current?.present();
    };

    const handleListCreated = async (listId: string, listName: string) => {
      if (isBulkMode) {
        setPendingSelections((prev) => ({
          ...prev,
          [listId]: true,
        }));
        setSuccessMessage(t('library.listCreated'));
        await sheetRef.current?.present();
        return;
      }

      if (!mediaItem) {
        await sheetRef.current?.present();
        return;
      }

      try {
        await addMutation.mutateAsync({ listId, mediaItem, listName });
        initialMembershipRef.current[listId] = true;
        setPendingSelections((prev) => ({
          ...prev,
          [listId]: true,
        }));
        setSuccessMessage(t('library.addedToList', { list: listName }));
        await reconcileListQueries();
      } catch (error) {
        handleMutationError(error instanceof Error ? error : new Error(t('errors.saveFailed')));
      }

      await sheetRef.current?.present();
    };

    const handleCreateListCancelled = async () => {
      await sheetRef.current?.present();
    };

    return (
      <>
        <TrueSheet
          ref={sheetRef}
          detents={[0.8]}
          scrollable
          cornerRadius={BORDER_RADIUS.l}
          backgroundColor={COLORS.surface}
          onDidDismiss={handleDismiss}
          grabber={true}
        >
          <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
            <View style={modalHeaderStyles.header}>
              <Text style={modalHeaderStyles.title}>{bulkHeaderTitle}</Text>
              {isBulkMode && (
                <Text style={styles.subtitle}>
                  {t('library.selectedItemsCount', { count: bulkMediaItems.length })}
                </Text>
              )}
            </View>

            {successMessage && (
              <View style={styles.successBanner}>
                <Text style={styles.successBannerText}>{successMessage}</Text>
              </View>
            )}

            {(operationError || listsError) && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  {operationError ||
                    (listsError instanceof Error ? listsError.message : t('errors.loadingFailed'))}
                </Text>
              </View>
            )}

            {isLoadingLists ? (
              <ActivityIndicator size="large" color={accentColor} style={styles.loader} />
            ) : (
              <FlatList
                ref={listRef}
                data={listsWithCounts}
                keyExtractor={(item) => item.id}
                style={styles.listContainer}
                showsVerticalScrollIndicator
                nestedScrollEnabled={true}
                renderItem={({ item: list }) => (
                  <ListItemRow
                    list={list}
                    isSelected={!!pendingSelections[list.id]}
                    isSaving={isSaving}
                    onToggle={handleToggleList}
                    onDelete={handleDeleteList}
                    allowDelete={!isBulkMode}
                  />
                )}
              />
            )}

            <Pressable
              style={[
                styles.saveButton,
                { backgroundColor: accentColor },
                (!hasChanges || isSaving) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              testID="add-to-list-save-button"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Check size={20} color={hasChanges ? COLORS.white : COLORS.textSecondary} />
                  <Text style={[styles.saveButtonText, !hasChanges && styles.saveButtonTextDisabled]}>
                    {t('common.saveChanges')}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.createListButton,
                { backgroundColor: accentColor },
                isSaving && styles.buttonDisabled,
              ]}
              onPress={handleCreateCustomListPress}
              disabled={isSaving}
            >
              <Plus size={20} color={COLORS.white} />
              <Text style={styles.createListText}>{t('library.createCustomList')}</Text>
            </Pressable>

            <Pressable
              style={[styles.manageListsButton, isSaving && styles.buttonDisabled]}
              onPress={() => {
                sheetRef.current?.dismiss();
                router.push('/manage-lists');
              }}
              disabled={isSaving}
            >
              <Settings2 size={20} color={COLORS.textSecondary} />
              <Text style={styles.manageListsText}>{t('library.manageLists')}</Text>
            </Pressable>
          </GestureHandlerRootView>
        </TrueSheet>

        <CreateListModal
          ref={createListModalRef}
          onSuccess={handleListCreated}
          onCancel={handleCreateListCancelled}
        />
      </>
    );
  }
);

AddToListModal.displayName = 'AddToListModal';

export default AddToListModal;

const styles = StyleSheet.create({
  loader: {
    padding: SPACING.xl,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  listContainer: {
    maxHeight: MODAL_LIST_HEIGHT,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    marginRight: SPACING.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listName: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    flex: 1,
  },
  listIcon: {
    marginRight: SPACING.m,
  },
  itemCount: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginLeft: SPACING.s,
  },
  createListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.s,
    padding: SPACING.m,
    gap: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
  },
  createListText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  manageListsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.s,
    padding: SPACING.m,
    gap: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  manageListsText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: COLORS.error,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  errorBannerText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  successBanner: {
    backgroundColor: '#22c55e',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  successBannerText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    marginTop: SPACING.m,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
