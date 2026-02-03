import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { isDefaultList } from '@/src/constants/lists';
import { MODAL_LIST_HEIGHT } from '@/src/constants/modalLayout';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import {
  useAddToList,
  useDeleteList,
  useLists,
  useMediaLists,
  useRemoveFromList,
} from '@/src/hooks/useLists';
import { ListMediaItem, UserList } from '@/src/services/ListService';
import { getListIconComponent } from '@/src/utils/listIcons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
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
  mediaItem: Omit<ListMediaItem, 'addedAt'>;
  onShowToast?: (message: string) => void;
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
}>(
  ({ list, isSelected, isSaving, onToggle, onDelete }) => {
    const handlePress = useCallback(() => onToggle(list.id), [list.id, onToggle]);
    const handleLongPress = useCallback(
      () => onDelete(list.id, list.name),
      [list.id, list.name, onDelete]
    );

    const ListIcon = getListIconComponent(list.id);

    return (
      <Pressable
        style={styles.listItem}
        onPress={handlePress}
        onLongPress={handleLongPress}
        disabled={isSaving}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          <AnimatedCheck visible={isSelected} />
        </View>
        <View style={styles.listIcon}>
          <ListIcon size={20} color={COLORS.textSecondary} />
        </View>
        <Text style={styles.listName}>{list.name}</Text>
        <Text style={styles.itemCount}>
          {list.itemCount} {list.itemCount === 1 ? 'item' : 'items'}
        </Text>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.list.id === next.list.id &&
    prev.list.itemCount === next.list.itemCount &&
    prev.isSelected === next.isSelected &&
    prev.isSaving === next.isSaving
);

ListItemRow.displayName = 'ListItemRow';

const AddToListModal = forwardRef<AddToListModalRef, AddToListModalProps>(
  ({ mediaItem, onShowToast }, ref) => {
    const router = useRouter();
    const sheetRef = useRef<TrueSheet>(null);
    const listRef = useRef<FlatList<ListWithCount>>(null);
    const createListModalRef = useRef<CreateListModalRef>(null);
    const { width } = useWindowDimensions();
    const [operationError, setOperationError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Local state to track pending selections (toggled independently of Firebase)
    const [pendingSelections, setPendingSelections] = useState<Record<string, boolean>>({});
    // Stable snapshot of membership at modal open time (not reactive)
    const initialMembershipRef = useRef<Record<string, boolean>>({});
    // Flag to preserve state when temporarily dismissing for create list flow
    const isTransitioningToCreateRef = useRef(false);

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
    const { membership } = useMediaLists(mediaItem.id);

    const addMutation = useAddToList();
    const removeMutation = useRemoveFromList();
    const deleteMutation = useDeleteList();

    // Pre-compute item counts once when lists change (not on every render)
    const listsWithCounts = useMemo<ListWithCount[]>(() => {
      if (!lists) return [];
      return lists.map((list) => ({
        ...list,
        itemCount: list.items ? Object.keys(list.items).length : 0,
      }));
    }, [lists]);

    // Check if there are unsaved changes (compare against initial snapshot, not reactive membership)
    const hasChanges = useMemo(() => {
      return Object.keys(pendingSelections).some((listId) => {
        const originalMembership = !!initialMembershipRef.current[listId];
        return pendingSelections[listId] !== originalMembership;
      });
    }, [pendingSelections]);

    useImperativeHandle(ref, () => ({
      present: async () => {
        initialMembershipRef.current = { ...membership };
        setPendingSelections({ ...membership });
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
    }, []);

    // Error handler for mutations
    const handleMutationError = useCallback(
      (error: Error) => {
        console.error('List operation failed:', error);

        if (error.message.includes('LimitReached')) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            'Limit Reached',
            error.message + '\n\nUpgrade to Premium for unlimited lists and items.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Upgrade',
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

        setOperationError(error.message || 'Failed to update list');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
      [router]
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

    // Save all pending changes to Firebase
    const handleSave = async () => {
      if (!listsWithCounts.length) return;

      // Early exit: check if there are actually any changes to save
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

      const operations: Promise<unknown>[] = [];

      // Only loop through changed lists, not all lists
      for (const list of changedLists) {
        const wasInList = !!initialMembershipRef.current[list.id];
        const isNowInList = !!pendingSelections[list.id];

        if (wasInList && !isNowInList) {
          operations.push(removeMutation.mutateAsync({ listId: list.id, mediaId: mediaItem.id }));
        } else if (!wasInList && isNowInList) {
          operations.push(
            addMutation.mutateAsync({ listId: list.id, mediaItem, listName: list.name })
          );
        }
      }

      // Use allSettled to handle partial failures gracefully
      const results = await Promise.allSettled(operations);
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );

      if (failures.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (onShowToast) {
          onShowToast('Lists updated');
        }
        await sheetRef.current?.dismiss();
      } else if (failures.length < operations.length) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setOperationError(`${failures.length} of ${operations.length} changes failed to save`);
        setIsSaving(false);
      } else {
        const firstError = failures[0].reason;
        handleMutationError(
          firstError instanceof Error ? firstError : new Error('Failed to update lists')
        );
        setIsSaving(false);
      }
    };

    const handleDeleteList = (listId: string, listName: string) => {
      if (isDefaultList(listId)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Cannot Delete', 'Cannot delete default lists', [{ text: 'OK' }]);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        'Delete List',
        `This will remove "${listName}" and all its items. This cannot be undone.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteMutation.mutateAsync(listId);
                // Remove from pending selections too
                setPendingSelections((prev) => {
                  const updated = { ...prev };
                  delete updated[listId];
                  return updated;
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                if (onShowToast) {
                  onShowToast('List deleted');
                }
              } catch (error) {
                console.error('Failed to delete list:', error);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert(
                  'Delete Failed',
                  error instanceof Error ? error.message : 'Failed to delete list'
                );
              }
            },
          },
        ]
      );
    };

    const handleCreateCustomListPress = async () => {
      // Mark that we're transitioning to prevent state reset
      isTransitioningToCreateRef.current = true;
      await sheetRef.current?.dismiss();
      await createListModalRef.current?.present();
    };

    const handleListCreated = async (listId: string, listName: string) => {
      // Still save immediately for new list creation
      // Update initialMembershipRef only on success to prevent duplicate adds
      addMutation.mutate(
        { listId, mediaItem, listName },
        {
          onSuccess: () => {
            // Mark as already saved in the initial ref so Save Changes won't re-add
            initialMembershipRef.current[listId] = true;
            // Add to pending selections so UI reflects the change
            setPendingSelections((prev) => ({
              ...prev,
              [listId]: true,
            }));
            setSuccessMessage(`Added to '${listName}'`);
          },
          onError: handleMutationError,
        }
      );
      // Present the sheet immediately so user sees modal return
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
              <Text style={modalHeaderStyles.title}>Add to List</Text>
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
                    (listsError instanceof Error ? listsError.message : 'Failed to load lists')}
                </Text>
              </View>
            )}

            {isLoadingLists ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
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
                  />
                )}
              />
            )}

            <Pressable
              style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Check size={20} color={hasChanges ? COLORS.white : COLORS.textSecondary} />
                  <Text
                    style={[styles.saveButtonText, !hasChanges && styles.saveButtonTextDisabled]}
                  >
                    Save Changes
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[styles.createListButton, isSaving && styles.buttonDisabled]}
              onPress={handleCreateCustomListPress}
              disabled={isSaving}
            >
              <Plus size={20} color={COLORS.white} />
              <Text style={styles.createListText}>Create Custom List</Text>
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
              <Text style={styles.manageListsText}>Manage Lists</Text>
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
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
