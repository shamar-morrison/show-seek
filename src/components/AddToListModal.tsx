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
import { Plus, Settings2 } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
    // Flag to scroll to bottom after list creation
    const shouldScrollToBottomRef = useRef(false);
    const [operationError, setOperationError] = useState<string | null>(null);

    useEffect(() => {
      if (operationError) {
        const timer = setTimeout(() => {
          setOperationError(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }, [operationError]);

    const hasChangesRef = useRef(false);

    const { data: lists, isLoading: isLoadingLists, error: listsError } = useLists();
    const { membership } = useMediaLists(mediaItem.id);

    const addMutation = useAddToList();
    const removeMutation = useRemoveFromList();
    const deleteMutation = useDeleteList();

    useImperativeHandle(ref, () => ({
      present: async () => {
        hasChangesRef.current = false;
        setOperationError(null);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleDismiss = useCallback(() => {
      if (hasChangesRef.current && onShowToast) {
        onShowToast('Lists updated');
      }
      setOperationError(null);
    }, [onShowToast]);

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

    const handleToggleList = (listId: string, listName: string, isMember: boolean) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setOperationError(null);
      hasChangesRef.current = true;

      if (isMember) {
        removeMutation.mutate({ listId, mediaId: mediaItem.id }, { onError: handleMutationError });
      } else {
        addMutation.mutate({ listId, mediaItem, listName }, { onError: handleMutationError });
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
      await sheetRef.current?.dismiss();
      await createListModalRef.current?.present();
    };

    const handleListCreated = async (listId: string, listName: string) => {
      hasChangesRef.current = true;
      addMutation.mutate({ listId, mediaItem, listName }, { onError: handleMutationError });
      shouldScrollToBottomRef.current = true;
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
                onContentSizeChange={() => {
                  if (shouldScrollToBottomRef.current) {
                    shouldScrollToBottomRef.current = false;
                    listRef.current?.scrollToEnd({ animated: true });
                  }
                }}
                renderItem={({ item: list }) => {
                  const isMember = !!membership[list.id];
                  return (
                    <Pressable
                      style={styles.listItem}
                      onPress={() => handleToggleList(list.id, list.name, isMember)}
                      onLongPress={() => handleDeleteList(list.id, list.name)}
                    >
                      <View style={[styles.checkbox, isMember && styles.checkboxChecked]}>
                        <AnimatedCheck visible={isMember} />
                      </View>
                      <Text style={styles.listName}>{list.name}</Text>
                    </Pressable>
                  );
                }}
              />
            )}

            <Pressable style={styles.createListButton} onPress={handleCreateCustomListPress}>
              <Plus size={20} color={COLORS.white} />
              <Text style={styles.createListText}>Create Custom List</Text>
            </Pressable>

            <Pressable
              style={styles.manageListsButton}
              onPress={() => {
                sheetRef.current?.dismiss();
                router.push('/manage-lists');
              }}
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
  },
  createListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.m,
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
});
