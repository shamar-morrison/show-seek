import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import {
  useAddToList,
  useCreateList,
  useDeleteList,
  useLists,
  useMediaLists,
  useRemoveFromList,
} from '@/src/hooks/useLists';
import { ListMediaItem } from '@/src/services/ListService';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Check, Plus, Settings2 } from 'lucide-react-native';
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
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.8;
const LIST_HEIGHT = SHEET_HEIGHT * 0.5;

export interface AddToListModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface AddToListModalProps {
  mediaItem: Omit<ListMediaItem, 'addedAt'>;
  onShowToast?: (message: string) => void;
}

const AnimatedCheck = ({ visible }: { visible: boolean }) => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 10,
      }).start();
    } else {
      Animated.timing(scale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Check size={14} color={COLORS.white} strokeWidth={3} />
    </Animated.View>
  );
};

const AddToListModal = forwardRef<AddToListModalRef, AddToListModalProps>(
  ({ mediaItem, onShowToast }, ref) => {
    const router = useRouter();
    const sheetRef = useRef<TrueSheet>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [createError, setCreateError] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);

    const hasChangesRef = useRef(false);

    const { data: lists, isLoading: isLoadingLists, error: listsError } = useLists();
    const { membership } = useMediaLists(mediaItem.id);

    const addMutation = useAddToList();
    const removeMutation = useRemoveFromList();
    const createMutation = useCreateList();
    const deleteMutation = useDeleteList();

    useImperativeHandle(ref, () => ({
      present: async () => {
        hasChangesRef.current = false;
        setCreateError(null);
        setOperationError(null);
        setIsCreating(false);
        setNewListName('');
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
      setIsCreating(false);
      setNewListName('');
      setCreateError(null);
      setOperationError(null);
    }, [onShowToast]);

    // Error handler for mutations
    const handleMutationError = useCallback((error: Error) => {
      console.error('List operation failed:', error);
      setOperationError(error.message || 'Failed to update list');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }, []);

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

    const handleCreateList = async () => {
      if (!newListName.trim()) return;

      setCreateError(null);

      try {
        // 1. Create list (must await to get the listId)
        const listId = await createMutation.mutateAsync(newListName.trim());

        // 2. Add item to new list (fire-and-forget with optimistic update)
        hasChangesRef.current = true;
        addMutation.mutate(
          {
            listId,
            mediaItem,
            listName: newListName.trim(),
          },
          { onError: handleMutationError }
        );

        // 3. Success feedback and reset UI immediately
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNewListName('');
        setIsCreating(false);
      } catch (error) {
        console.error('Failed to create list:', error);
        setCreateError('Failed to create list. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    const handleDeleteList = (listId: string, listName: string) => {
      const DEFAULT_LIST_IDS = [
        'favorites',
        'watchlist', // should watch
        'currently-watching',
        'already-watched',
        'dropped',
      ];

      if (DEFAULT_LIST_IDS.includes(listId)) {
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

    return (
      <TrueSheet
        ref={sheetRef}
        detents={[0.8]}
        scrollable
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        onDidDismiss={handleDismiss}
        grabber={true}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{isCreating ? 'Create New List' : 'Add to List'}</Text>
          </View>

          {(operationError || listsError) && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                {operationError ||
                  (listsError instanceof Error ? listsError.message : 'Failed to load lists')}
              </Text>
            </View>
          )}

          {isCreating ? (
            <View style={styles.createContainer}>
              <TextInput
                style={styles.input}
                placeholder="List Name"
                placeholderTextColor={COLORS.textSecondary}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
                returnKeyType="done"
                editable={!createMutation.isPending}
                onSubmitEditing={handleCreateList}
              />
              {createError && <Text style={styles.errorText}>{createError}</Text>}
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsCreating(false)}
                  activeOpacity={ACTIVE_OPACITY}
                  disabled={createMutation.isPending}
                >
                  <Text
                    style={[
                      styles.cancelButtonText,
                      createMutation.isPending && styles.disabledText,
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.createButton,
                    (!newListName.trim() || createMutation.isPending) && styles.disabledButton,
                  ]}
                  onPress={handleCreateList}
                  disabled={!newListName.trim() || createMutation.isPending}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  {createMutation.isPending ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.createButtonText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {isLoadingLists ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
              ) : (
                <ScrollView
                  style={styles.listContainer}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled={true}
                  contentContainerStyle={{ flexGrow: 1 }}
                >
                  {lists?.map((list) => {
                    const isMember = !!membership[list.id];
                    return (
                      <Pressable
                        key={list.id}
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
                  })}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.createListButton}
                onPress={() => setIsCreating(true)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Plus size={20} color={COLORS.primary} />
                <Text style={styles.createListText}>Create Custom List</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.manageListsButton}
                onPress={() => {
                  sheetRef.current?.dismiss();
                  router.push('/manage-lists');
                }}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Settings2 size={20} color={COLORS.textSecondary} />
                <Text style={styles.manageListsText}>Manage Lists</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TrueSheet>
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
    maxHeight: LIST_HEIGHT,
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
    paddingVertical: SPACING.s,
    gap: SPACING.s,
  },
  createListText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  createContainer: {
    gap: SPACING.m,
  },
  input: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.s,
  },
  createActions: {
    flexDirection: 'row',
    gap: SPACING.m,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: SPACING.m,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  disabledText: {
    opacity: 0.5,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    minWidth: 80,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  createButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
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
  manageListsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.s,
    paddingVertical: SPACING.s,
    gap: SPACING.s,
  },
  manageListsText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
});
