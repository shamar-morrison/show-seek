import { filterCustomLists, MAX_FREE_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { PremiumLimitError, useCreateList, useLists } from '@/src/hooks/useLists';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

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
    const { width } = useWindowDimensions();
    const [listName, setListName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const createMutation = useCreateList();
    const router = useRouter();
    const { isPremium, isLoading: isPremiumLoading } = usePremium();
    const { data: lists, isLoading: isListsLoading } = useLists();

    // Calculate custom list count - only check limits when both premium status and lists are loaded
    const customListCount = lists ? filterCustomLists(lists).length : 0;
    const hasReachedLimit =
      !isPremium && !isPremiumLoading && !isListsLoading && customListCount >= MAX_FREE_LISTS;

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

      // Proactive check: If user has reached the limit, redirect to premium
      if (hasReachedLimit) {
        await sheetRef.current?.dismiss();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => {
          router.push('/premium');
        }, 300);
        return;
      }

      try {
        const listId = await createMutation.mutateAsync(trimmedName);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess?.(listId, trimmedName);
        await sheetRef.current?.dismiss();
      } catch (err: any) {
        // Handle PremiumLimitError from hook as fallback (in case proactive check was bypassed)
        if (err instanceof PremiumLimitError) {
          await sheetRef.current?.dismiss();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTimeout(() => {
            router.push('/premium');
          }, 300);
          return;
        }
        setError('Failed to create list. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        <GestureHandlerRootView style={[styles.content, { width }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Create New List</Text>
            <Pressable onPress={() => sheetRef.current?.dismiss()}>
              <X size={24} color={COLORS.text} />
            </Pressable>
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
              <Pressable
                style={styles.cancelButton}
                onPress={() => sheetRef.current?.dismiss()}
                disabled={createMutation.isPending}
              >
                <Text
                  style={[styles.cancelButtonText, createMutation.isPending && styles.disabledText]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.createButton,
                  (!listName.trim() || createMutation.isPending) && styles.disabledButton,
                ]}
                onPress={handleCreate}
                disabled={!listName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        </GestureHandlerRootView>
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
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  disabledText: {
    opacity: 0.5,
  },
  createButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
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
