import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useRenameList } from '@/src/hooks/useLists';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

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
    const { width } = useWindowDimensions();
    const [listId, setListId] = useState('');
    const [listName, setListName] = useState('');
    const [originalName, setOriginalName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const renameMutation = useRenameList();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();

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
        setError(err instanceof Error ? err.message : t('errors.saveFailed'));
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
        <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('library.renameList')}</Text>
            <Pressable onPress={() => sheetRef.current?.dismiss()}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.formContainer}>
            <TextInput
              style={styles.input}
              placeholder={t('library.listName')}
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
              <Pressable
                style={styles.cancelButton}
                onPress={() => sheetRef.current?.dismiss()}
                disabled={renameMutation.isPending}
              >
                <Text
                  style={[styles.cancelButtonText, renameMutation.isPending && styles.disabledText]}
                >
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveButton,
                  { backgroundColor: accentColor },
                  (!hasChanges || renameMutation.isPending) && styles.disabledButton,
                ]}
                onPress={handleRename}
                disabled={!hasChanges || renameMutation.isPending}
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.saveButtonText}>{t('common.save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

RenameListModal.displayName = 'RenameListModal';

export default RenameListModal;

const styles = StyleSheet.create({
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
  saveButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
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
