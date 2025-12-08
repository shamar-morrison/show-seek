import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCreateList } from '@/src/hooks/useLists';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Modal, Portal } from 'react-native-paper';

interface CreateListModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (listId: string, listName: string) => void;
}

export default function CreateListModal({ visible, onClose, onSuccess }: CreateListModalProps) {
  const [listName, setListName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateList();

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setListName('');
      setError(null);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleCreate = async () => {
    const trimmedName = listName.trim();
    if (!trimmedName) return;

    setError(null);

    try {
      const listId = await createMutation.mutateAsync(trimmedName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.(listId, trimmedName);
      onClose();
    } catch (err) {
      console.error('Failed to create list:', err);
      setError('Failed to create list. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={styles.modalContainer}
        style={styles.modal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Create New List</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
                <X size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.createContainer}>
              <TextInput
                style={styles.input}
                placeholder="List Name"
                placeholderTextColor={COLORS.textSecondary}
                value={listName}
                onChangeText={setListName}
                autoFocus
                returnKeyType="done"
                editable={!createMutation.isPending}
                onSubmitEditing={handleCreate}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleClose}
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
                    (!listName.trim() || createMutation.isPending) && styles.disabledButton,
                  ]}
                  onPress={handleCreate}
                  disabled={!listName.trim() || createMutation.isPending}
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    justifyContent: 'center',
    alignItems: 'center',
    margin: SPACING.l,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  keyboardView: {
    width: '100%',
  },
  content: {
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
});
