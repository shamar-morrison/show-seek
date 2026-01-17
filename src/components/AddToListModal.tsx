import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { isDefaultList } from '@/src/constants/lists';
import { MODAL_LIST_HEIGHT } from '@/src/constants/modalLayout';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import {
  useAddToList,
  useDeleteList,
  useLists,
  useMediaLists,
  useRemoveFromList,
} from '@/src/hooks/useLists';
import { ListMediaItem, UserList } from '@/src/services/ListService';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  Check,
  CirclePlay,
  Folder,
  Heart,
  Plus,
  Settings2,
  X,
} from 'lucide-react-native';
import React, {
  forwardRef,
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

const AddToListModal = forwardRef<AddToListModalRef, AddToListModalProps>(
  ({ mediaItem, onShowToast }, ref) => {
    const router = useRouter();
    const sheetRef = useRef<TrueSheet>(null);
    const listRef = useRef<FlatList<UserList>>(null);
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

    // Icon mapping for default lists
    const getListIcon = (listId: string) => {
      switch (listId) {
        case 'watchlist':
          return <Bookmark size={20} color={COLORS.textSecondary} />;
        case 'currently-watching':
          return <CirclePlay size={20} color={COLORS.textSecondary} />;
        case 'already-watched':
          return <Check size={20} color={COLORS.textSecondary} />;
        case 'favorites':
          return <Heart size={20} color={COLORS.textSecondary} />;
        case 'dropped':
          return <X size={20} color={COLORS.textSecondary} />;
        default:
          // Custom lists use folder icon
          return <Folder size={20} color={COLORS.textSecondary} />;
      }
    };

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
      if (!lists) return;

      setIsSaving(true);
      setOperationError(null);

      const operations: Promise<unknown>[] = [];

      for (const list of lists) {
        const wasInList = !!initialMembershipRef.current[list.id];
        const isNowInList = !!pendingSelections[list.id];

        if (wasInList && !isNowInList) {
          // Remove from list
          operations.push(removeMutation.mutateAsync({ listId: list.id, mediaId: mediaItem.id }));
        } else if (!wasInList && isNowInList) {
          // Add to list
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
        // All operations succeeded
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (onShowToast) {
          onShowToast('Lists updated');
        }
        await sheetRef.current?.dismiss();
      } else if (failures.length < operations.length) {
        // Some operations succeeded, some failed
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setOperationError(`${failures.length} of ${operations.length} changes failed to save`);
        setIsSaving(false);
      } else {
        // All operations failed
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
          <GestureHandlerRootView style={[styles.content, { width }]}>
            <View style={styles.header}>
              <Text style={styles.title}>Add to List</Text>
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
                data={lists}
                keyExtractor={(item) => item.id}
                style={styles.listContainer}
                showsVerticalScrollIndicator
                nestedScrollEnabled={true}
                renderItem={({ item: list }) => {
                  const isSelected = !!pendingSelections[list.id];
                  const itemCount = list.items ? Object.keys(list.items).length : 0;
                  return (
                    <Pressable
                      style={styles.listItem}
                      onPress={() => handleToggleList(list.id)}
                      onLongPress={() => handleDeleteList(list.id, list.name)}
                      disabled={isSaving}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        <AnimatedCheck visible={isSelected} />
                      </View>
                      <View style={styles.listIcon}>{getListIcon(list.id)}</View>
                      <Text style={styles.listName}>{list.name}</Text>
                      <Text style={styles.itemCount}>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </Text>
                    </Pressable>
                  );
                }}
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
  content: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
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
