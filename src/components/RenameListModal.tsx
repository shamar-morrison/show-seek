import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useRenameList } from '@/src/hooks/useLists';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export interface RenameListModalRef {
  present: (params: { listId: string; currentName: string }) => Promise<void>;
  dismiss: () => Promise<void>;
}

interface RenameListModalProps {
  onSuccess?: (listId: string, newName: string) => void;
}

const RenameListModal = forwardRef<RenameListModalRef, RenameListModalProps>(
  ({ onSuccess }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const [listId, setListId] = useState('');
    const [listName, setListName] = useState('');
    const [originalName, setOriginalName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const renameMutation = useRenameList();

    useImperativeHandle(ref, () => ({
      present: async ({ listId: id, currentName }) => {
        setListId(id);
        setListName(currentName);
        setOriginalName(currentName);
        setError(null);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleDismiss = useCallback(() => {
      setListId('');
      setListName('');
      setOriginalName('');
      setError(null);
    }, []);

    const handleRename = async () => {
      const trimmedName = listName.trim();
      if (!trimmedName || trimmedName === originalName) return;

      setError(null);

      try {
        await renameMutation.mutateAsync({ listId, newName: trimmedName });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess?.(listId, trimmedName);
        await sheetRef.current?.dismiss();
      } catch (err) {
        console.error('Failed to rename list:', err);
        setError(err instanceof Error ? err.message : 'Failed to rename list. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    const hasChanges = listName.trim() && listName.trim() !== originalName;

    return (
      <TrueSheet
        ref={sheetRef}
        detents={[0.8]}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        onDidDismiss={handleDismiss}
        grabber={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Rename List</Text>
            <TouchableOpacity
              onPress={() => sheetRef.current?.dismiss()}
              activeOpacity={ACTIVE_OPACITY}
            >
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder="List Name"
              placeholderTextColor={COLORS.textSecondary}
              value={listName}
              onChangeText={setListName}
              autoFocus
              returnKeyType="done"
              editable={!renameMutation.isPending}
              onSubmitEditing={handleRename}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => sheetRef.current?.dismiss()}
                activeOpacity={ACTIVE_OPACITY}
                disabled={renameMutation.isPending}
              >
                <Text
                  style={[styles.cancelButtonText, renameMutation.isPending && styles.disabledText]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (!hasChanges || renameMutation.isPending) && styles.disabledButton,
                ]}
                onPress={handleRename}
                disabled={!hasChanges || renameMutation.isPending}
                activeOpacity={ACTIVE_OPACITY}
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TrueSheet>
    );
  }
);

RenameListModal.displayName = 'RenameListModal';

export default RenameListModal;

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
  formContainer: {
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
  actions: {
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
  saveButton: {
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
  saveButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});
