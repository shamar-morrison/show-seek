import { filterCustomLists, MAX_FREE_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { PremiumLimitError, useCreateList, useLists } from '@/src/hooks/useLists';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
  onCancel?: () => void;
}

const CreateListModal = forwardRef<CreateListModalRef, CreateListModalProps>(
  ({ onSuccess, onCancel }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();
    const [listName, setListName] = useState('');
    const [listDescription, setListDescription] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { accentColor } = useAccentColor();

    const createMutation = useCreateList();
    const router = useRouter();
    const { t } = useTranslation();
    const { isPremium, isLoading: isPremiumLoading } = usePremium();
    const { data: lists, isLoading: isListsLoading } = useLists();

    // Calculate custom list count - only check limits when both premium status and lists are loaded
    const customListCount = lists ? filterCustomLists(lists).length : 0;
    const hasReachedLimit =
      !isPremium && !isPremiumLoading && !isListsLoading && customListCount >= MAX_FREE_LISTS;

    // Track whether we should skip calling onCancel (e.g., created successfully or navigating to upgrade)
    const skipOnCancelRef = useRef(false);

    useImperativeHandle(ref, () => ({
      present: async () => {
        setListName('');
        setListDescription('');
        setError(null);
        skipOnCancelRef.current = false;
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const handleDismiss = useCallback(() => {
      setListName('');
      setListDescription('');
      setError(null);
      // Only call onCancel if we didn't create a list or navigate to upgrade
      if (!skipOnCancelRef.current) {
        onCancel?.();
      }
    }, [onCancel]);

    const showUpgradeAlert = useCallback(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        t('library.limitReachedTitle'),
        t('library.limitReachedMessage', { max: MAX_FREE_LISTS }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.upgradeToPremium'),
            style: 'default',
            onPress: async () => {
              skipOnCancelRef.current = true;
              await sheetRef.current?.dismiss();
              router.push('/premium');
            },
          },
        ]
      );
    }, [router, t]);

    const handleCreate = async () => {
      const trimmedName = listName.trim();
      if (!trimmedName) return;

      setError(null);

      // Proactive check: If user has reached the limit, show upgrade dialog
      if (hasReachedLimit) {
        showUpgradeAlert();
        return;
      }

      try {
        const trimmedDescription = listDescription.trim();
        const listId = await createMutation.mutateAsync({
          name: trimmedName,
          description: trimmedDescription ? trimmedDescription : undefined,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        skipOnCancelRef.current = true;
        onSuccess?.(listId, trimmedName);
        await sheetRef.current?.dismiss();
      } catch (err: any) {
        // Handle PremiumLimitError from hook as fallback (in case proactive check was bypassed)
        if (err instanceof PremiumLimitError) {
          showUpgradeAlert();
          return;
        }
        setError(t('library.failedToCreateList'));
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
        <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('library.createNewList')}</Text>
            <Pressable onPress={() => sheetRef.current?.dismiss()}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.createContainer}>
            <TextInput
              style={styles.input}
              placeholder={t('library.listName')}
              placeholderTextColor={COLORS.textSecondary}
              value={listName}
              onChangeText={setListName}
              autoFocus
              returnKeyType="done"
              editable={!createMutation.isPending}
              onSubmitEditing={handleCreate}
            />
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder={t('library.listDescription')}
              placeholderTextColor={COLORS.textSecondary}
              value={listDescription}
              onChangeText={setListDescription}
              editable={!createMutation.isPending}
              multiline
              maxLength={120}
              textAlignVertical="top"
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
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.createButton,
                  { backgroundColor: accentColor },
                  (!listName.trim() || createMutation.isPending) && styles.disabledButton,
                ]}
                onPress={handleCreate}
                disabled={!listName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.createButtonText}>{t('common.create')}</Text>
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
  descriptionInput: {
    minHeight: 96,
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
