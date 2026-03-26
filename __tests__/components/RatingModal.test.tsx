import RatingModal from '@/src/components/RatingModal';
import { listService } from '@/src/services/ListService';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockRateMediaMutateAsync = jest.fn();
const mockDeleteMediaMutateAsync = jest.fn();
const mockRateEpisodeMutateAsync = jest.fn();
const mockDeleteEpisodeMutateAsync = jest.fn();
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const addToListSpy = jest.spyOn(listService, 'addToList');
const removeFromListSpy = jest.spyOn(listService, 'removeFromList');

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useRateMedia: () => ({ mutateAsync: mockRateMediaMutateAsync }),
  useDeleteRating: () => ({ mutateAsync: mockDeleteMediaMutateAsync }),
  useRateEpisode: () => ({ mutateAsync: mockRateEpisodeMutateAsync }),
  useDeleteEpisodeRating: () => ({ mutateAsync: mockDeleteEpisodeMutateAsync }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-123' },
  }),
}));

jest.mock('@/src/context/TraktContext', () => ({
  useTrakt: () => ({
    isConnected: false,
  }),
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

// Mock lucide-react-native to avoid SVG import issues in tests
jest.mock('lucide-react-native', () => ({
  Star: () => 'Star',
  StarHalf: () => 'StarHalf',
  X: () => 'X',
}));

describe('RatingModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    mediaId: 123,
    mediaType: 'movie' as const,
    initialRating: 5,
    onRatingSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRateMediaMutateAsync.mockResolvedValue(undefined);
    mockDeleteMediaMutateAsync.mockResolvedValue(undefined);
    mockRateEpisodeMutateAsync.mockResolvedValue(undefined);
    mockDeleteEpisodeMutateAsync.mockResolvedValue(undefined);
    addToListSpy.mockResolvedValue(undefined);
    removeFromListSpy.mockResolvedValue(undefined);
  });

  it('renders rating text for existing rating', () => {
    const { getByText } = render(<RatingModal {...defaultProps} initialRating={2.5} />);
    expect(getByText('2.5/10')).toBeTruthy();
  });

  it('auto-removes from should watch when movie is rated and preference is enabled', async () => {
    const { getByText } = render(
      <RatingModal
        {...defaultProps}
        autoAddOptions={{
          shouldAutoRemoveFromShouldWatch: true,
          listMembership: { watchlist: true },
        }}
      />
    );

    fireEvent.press(getByText('Confirm Rating'));

    await waitFor(() => {
      expect(mockRateMediaMutateAsync).toHaveBeenCalled();
      expect(removeFromListSpy).toHaveBeenCalledWith('watchlist', 123, 'movie');
    });

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['lists', 'test-user-123'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['list-membership-index', 'test-user-123'],
        refetchType: 'active',
      });
    });
  });

  it('does not auto-remove when preference is disabled', async () => {
    const { getByText } = render(
      <RatingModal
        {...defaultProps}
        autoAddOptions={{
          shouldAutoRemoveFromShouldWatch: false,
          listMembership: { watchlist: true },
        }}
      />
    );

    fireEvent.press(getByText('Confirm Rating'));

    await waitFor(() => {
      expect(mockRateMediaMutateAsync).toHaveBeenCalled();
    });
    expect(removeFromListSpy).not.toHaveBeenCalled();
  });

  it('does not auto-remove when list membership is not loaded yet', async () => {
    const { getByText } = render(
      <RatingModal
        {...defaultProps}
        autoAddOptions={{
          shouldAutoRemoveFromShouldWatch: true,
        }}
      />
    );

    fireEvent.press(getByText('Confirm Rating'));

    await waitFor(() => {
      expect(mockRateMediaMutateAsync).toHaveBeenCalled();
    });

    expect(removeFromListSpy).not.toHaveBeenCalled();
  });

  it('does not auto-remove when rating tv content', async () => {
    const { getByText } = render(
      <RatingModal
        {...defaultProps}
        mediaType="tv"
        autoAddOptions={{
          shouldAutoRemoveFromShouldWatch: true,
          listMembership: { watchlist: true },
        }}
      />
    );

    fireEvent.press(getByText('Confirm Rating'));

    await waitFor(() => {
      expect(mockRateMediaMutateAsync).toHaveBeenCalled();
    });
    expect(removeFromListSpy).not.toHaveBeenCalled();
  });
});
