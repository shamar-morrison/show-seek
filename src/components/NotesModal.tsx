import { BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useDeleteNote, useSaveNote } from '@/src/hooks/useNotes';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { showPremiumAlert } from '@/src/utils/premiumAlert';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { Trash2, X } from 'lucide-react-native';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
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

const MAX_NOTE_LENGTH = 120;

export interface NoteModalRef {
  present: (params: {
    mediaType: 'movie' | 'tv';
    mediaId: number;
    posterPath: string | null;
    mediaTitle: string;
    initialNote?: string;
  }) => Promise<void>;
  dismiss: () => Promise<void>;
}

interface NoteModalProps {
  onSave?: () => void;
  onDelete?: () => void;
}

const NoteModal = forwardRef<NoteModalRef, NoteModalProps>(({ onSave, onDelete }, ref) => {
  const sheetRef = useRef<TrueSheet>(null);
  const { width } = useWindowDimensions();
  const { isPremium } = usePremium();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const saveNoteMutation = useSaveNote();
  const deleteNoteMutation = useDeleteNote();

  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [mediaId, setMediaId] = useState(0);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [mediaTitle, setMediaTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEditing = initialContent.length > 0;
  const hasChanges = noteContent.trim() !== initialContent;
  const canSave = noteContent.trim().length > 0 && hasChanges;

  const handleClose = useCallback(async () => {
    await sheetRef.current?.dismiss();
  }, []);

  useImperativeHandle(ref, () => ({
    present: async ({
      mediaType: type,
      mediaId: id,
      posterPath: poster,
      mediaTitle: title,
      initialNote,
    }) => {
      setMediaType(type);
      setMediaId(id);
      setPosterPath(poster);
      setMediaTitle(title);
      setNoteContent(initialNote || '');
      setInitialContent(initialNote || '');
      setError(null);
      await sheetRef.current?.present();
    },
    dismiss: handleClose,
  }));

  const handleDismiss = useCallback(() => {
    setNoteContent('');
    setInitialContent('');
    setMediaTitle('');
    setMediaId(0);
    setPosterPath(null);
    setError(null);
  }, []);

  const handleSave = async () => {
    if (!canSave) return;

    // Premium check
    if (!isPremium) {
      showPremiumAlert('premiumFeature.features.notes');
      return;
    }

    setError(null);

    try {
      await saveNoteMutation.mutateAsync({
        mediaType,
        mediaId,
        content: noteContent.trim(),
        posterPath,
        mediaTitle,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSave?.();
      await handleClose();
    } catch (err) {
      console.error('Failed to save note:', err);
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDelete = async () => {
    Alert.alert(t('notes.deleteNote'), t('notes.confirmDeleteNote'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNoteMutation.mutateAsync({ mediaType, mediaId });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onDelete?.();
            await handleClose();
          } catch (err) {
            console.error('Failed to delete note:', err);
            setError(err instanceof Error ? err.message : t('errors.deleteFailed'));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
      },
    ]);
  };

  const handleTextChange = (text: string) => {
    // Enforce max length
    if (text.length <= MAX_NOTE_LENGTH) {
      setNoteContent(text);
    }
  };

  const isLoading = saveNoteMutation.isPending || deleteNoteMutation.isPending;

  return (
    <TrueSheet
      ref={sheetRef}
      detents={[0.5]}
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      onDidDismiss={handleDismiss}
      grabber={false}
    >
        <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
        {/* Header */}
        <View style={modalHeaderStyles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={handleClose} hitSlop={HIT_SLOP.m}>
              <X size={24} color={COLORS.text} />
            </Pressable>
            <Text style={modalHeaderStyles.title}>
              {isEditing ? t('notes.editNote') : t('notes.addNote')}
            </Text>
          </View>
          {isEditing && (
            <Pressable onPress={handleDelete} disabled={isLoading} hitSlop={HIT_SLOP.m}>
              <Trash2 size={22} color={isLoading ? COLORS.textSecondary : COLORS.error} />
            </Pressable>
          )}
        </View>

        {/* Note Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder={t('notes.notePlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            value={noteContent}
            onChangeText={handleTextChange}
            multiline
            maxLength={MAX_NOTE_LENGTH}
            editable={!isLoading}
            textAlignVertical="top"
          />
          <Text style={styles.charCounter}>
            {noteContent.length}/{MAX_NOTE_LENGTH}
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable style={styles.cancelButton} onPress={handleClose} disabled={isLoading}>
            <Text style={[styles.cancelButtonText, isLoading && styles.disabledText]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.saveButton,
              { backgroundColor: accentColor },
              (!canSave || isLoading) && styles.disabledButton,
            ]}
            onPress={handleSave}
            disabled={!canSave || isLoading}
          >
            {saveNoteMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            )}
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </TrueSheet>
  );
});

NoteModal.displayName = 'NoteSheet';

export default NoteModal;

const styles = StyleSheet.create({
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
  },
  inputContainer: {
    marginBottom: SPACING.s,
  },
  textInput: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    minHeight: 100,
    maxHeight: 150,
  },
  charCounter: {
    textAlign: 'right',
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.xs,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.s,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.s,
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
