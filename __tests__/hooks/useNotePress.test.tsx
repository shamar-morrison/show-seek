import { useNotePress } from '@/src/hooks/useNotePress';
import type { Note } from '@/src/types/note';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const createNote = (content: string): Note => ({
  id: 'movie-10',
  userId: 'test-user-id',
  mediaType: 'movie',
  mediaId: 10,
  content,
  posterPath: '/poster.jpg',
  mediaTitle: 'Loaded Movie',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
});

describe('useNotePress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('catches note modal present failures and surfaces them through onLoadError and alert', async () => {
    const presentError = new Error('present failed');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onLoadError = jest.fn();
    const ensureNoteLoadedForEdit = jest.fn().mockResolvedValue(createNote('Loaded note'));
    const present = jest.fn().mockRejectedValue(presentError);
    const noteSheetRef = {
      current: {
        present,
        dismiss: jest.fn(),
      },
    };

    const { result } = renderHook(() =>
      useNotePress({
        note: null,
        noteExists: false,
        ensureNoteLoadedForEdit,
        isAccountRequired: () => false,
        noteSheetRef,
        buildPresentParams: (initialNote?: string) => ({
          mediaType: 'movie',
          mediaId: 10,
          posterPath: '/poster.jpg',
          mediaTitle: 'Loaded Movie',
          initialNote,
        }),
        onLoadError,
        alertTitle: 'Error',
        alertMessage: 'Try again',
      })
    );

    await act(async () => {
      await expect(result.current.handleNotePress()).resolves.toBeUndefined();
    });

    expect(ensureNoteLoadedForEdit).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'movie',
        mediaId: 10,
        initialNote: 'Loaded note',
      })
    );
    expect(onLoadError).toHaveBeenCalledWith(presentError);
    expect(alertSpy).toHaveBeenCalledWith('Error', 'Try again');

    alertSpy.mockRestore();
  });
});
