import type { NoteModalPresentParams, NoteModalRef } from '@/src/components/NotesModal';
import type { Note } from '@/src/types/note';
import { Alert } from 'react-native';
import { useCallback, useState, type RefObject } from 'react';

interface UseNotePressParams {
  note: Note | null;
  noteExists: boolean;
  ensureNoteLoadedForEdit: () => Promise<Note | null>;
  isAccountRequired: () => boolean;
  noteSheetRef: RefObject<NoteModalRef | null>;
  buildPresentParams: (initialNote?: string) => NoteModalPresentParams;
  onLoadError: (error: unknown) => void;
  alertTitle: string;
  alertMessage: string;
}

export const useNotePress = ({
  note,
  noteExists,
  ensureNoteLoadedForEdit,
  isAccountRequired,
  noteSheetRef,
  buildPresentParams,
  onLoadError,
  alertTitle,
  alertMessage,
}: UseNotePressParams) => {
  const [isOpeningNote, setIsOpeningNote] = useState(false);

  const openNoteEditor = useCallback(
    (initialNote?: string) => {
      void noteSheetRef.current?.present(buildPresentParams(initialNote));
    },
    [buildPresentParams, noteSheetRef]
  );

  const handleNotePress = useCallback(async () => {
    if (isAccountRequired() || isOpeningNote) {
      return;
    }

    setIsOpeningNote(true);

    try {
      const resolvedNote = note ?? (await ensureNoteLoadedForEdit());
      openNoteEditor(resolvedNote?.content ?? '');
    } catch (error) {
      onLoadError(error);
      Alert.alert(alertTitle, alertMessage);

      if (noteExists) {
        return;
      }

      openNoteEditor('');
    } finally {
      setIsOpeningNote(false);
    }
  }, [
    alertMessage,
    alertTitle,
    ensureNoteLoadedForEdit,
    isAccountRequired,
    isOpeningNote,
    note,
    noteExists,
    onLoadError,
    openNoteEditor,
  ]);

  return {
    handleNotePress,
    isOpeningNote,
  };
};
