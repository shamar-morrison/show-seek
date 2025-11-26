import { BlurView } from 'expo-blur';
import { Check, Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '../constants/theme';
import {
  useAddToList,
  useCreateList,
  useLists,
  useMediaLists,
  useRemoveFromList,
} from '../hooks/useLists';
import { ListMediaItem } from '../services/ListService';

interface AddToListModalProps {
  visible: boolean;
  onClose: () => void;
  mediaItem: Omit<ListMediaItem, 'addedAt'>;
}

export default function AddToListModal({ visible, onClose, mediaItem }: AddToListModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState('');

  const { data: lists, isLoading: isLoadingLists } = useLists();
  const membership = useMediaLists(mediaItem.id);

  const addMutation = useAddToList();
  const removeMutation = useRemoveFromList();
  const createMutation = useCreateList();

  const handleToggleList = (listId: string, listName: string, isMember: boolean) => {
    if (isMember) {
      removeMutation.mutate({ listId, mediaId: mediaItem.id });
    } else {
      addMutation.mutate({ listId, mediaItem, listName });
    }
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;

    createMutation.mutate(newListName.trim(), {
      onSuccess: (listId) => {
        // Automatically add to the new list
        addMutation.mutate({ listId, mediaItem, listName: newListName.trim() });
        setNewListName('');
        setIsCreating(false);
      },
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{isCreating ? 'Create New List' : 'Add to List'}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

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
                onSubmitEditing={handleCreateList}
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsCreating(false)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createButton, !newListName.trim() && styles.disabledButton]}
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
                <ScrollView style={styles.listContainer}>
                  {lists?.map((list) => {
                    const isMember = !!membership[list.id];
                    return (
                      <TouchableOpacity
                        key={list.id}
                        style={styles.listItem}
                        onPress={() => handleToggleList(list.id, list.name, isMember)}
                        activeOpacity={ACTIVE_OPACITY}
                      >
                        <View style={[styles.checkbox, isMember && styles.checkboxChecked]}>
                          {isMember && <Check size={14} color={COLORS.white} strokeWidth={3} />}
                        </View>
                        <Text style={styles.listName}>{list.name}</Text>
                      </TouchableOpacity>
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
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    maxHeight: 300,
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
});
