import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCreateList } from '@/src/hooks/useLists';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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

export interface CreateListModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface CreateListModalProps {
  onSuccess?: (listId: string, listName: string) => void;
}

const CreateListModal = forwardRef<CreateListModalRef, CreateListModalProps>(
  ({ onSuccess }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const [listName, setListName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const createMutation = useCreateList();
    const router = useRouter();

    useImperativeHandle(ref, () => ({
      present: async () => {
        setListName('');
        setError(null);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleDismiss = useCallback(() => {
      setListName('');
      setError(null);
    }, []);

    const handleCreate = async () => {
      const trimmedName = listName.trim();
      if (!trimmedName) return;

      setError(null);

      try {
        const listId = await createMutation.mutateAsync(trimmedName);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess?.(listId, trimmedName);
        await sheetRef.current?.dismiss();
      } catch (err: any) {
        console.error('Failed to create list:', err);
        // Check if this is a premium limit error
        if (err.message?.startsWith('LimitReached:')) {
          await sheetRef.current?.dismiss();
          // Navigate to premium screen after a brief delay to let modal dismiss
          setTimeout(() => {
            router.push('/premium');
          }, 100);
        } else {
          setError('Failed to create list. Please try again.');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    };

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
            <Text style={styles.title}>Create New List</Text>
            <TouchableOpacity
              onPress={() => sheetRef.current?.dismiss()}
              activeOpacity={ACTIVE_OPACITY}
            >
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
                onPress={() => sheetRef.current?.dismiss()}
                activeOpacity={ACTIVE_OPACITY}
                disabled={createMutation.isPending}
              >
                <Text
                  style={[styles.cancelButtonText, createMutation.isPending && styles.disabledText]}
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
      </TrueSheet>
    );
  }
);

CreateListModal.displayName = 'CreateListModal';

export default CreateListModal;

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
