import { render, fireEvent } from '@testing-library/react-native';
import { FavoriteEpisodeCard } from '@/src/components/library/FavoriteEpisodeCard';
import React from 'react';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Pencil: 'Pencil',
  Trash2: 'Trash2',
}));

// Mock translation
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (key === 'media.seasonEpisode') {
        return `S${options.season}E${options.episode}`;
      }
      return key;
    },
  }),
}));

// Mock MediaImage
jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: 'MediaImage',
}));

describe('FavoriteEpisodeCard', () => {
  const mockEpisode = {
    id: '123-1-5',
    tvShowId: 123,
    seasonNumber: 1,
    episodeNumber: 5,
    episodeName: 'Test Episode',
    showName: 'Test Show',
    posterPath: '/path.jpg',
    addedAt: Date.now(),
  };

  const mockNote = {
    id: 'note-id',
    userId: 'user-id',
    mediaType: 'episode' as const,
    mediaId: 123,
    content: 'My test note content',
    mediaTitle: 'Test Episode',
    posterPath: '/path.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
    seasonNumber: 1,
    episodeNumber: 5,
  };

  const mockOnPress = jest.fn();
  const mockOnEditNote = jest.fn();
  const mockOnDeleteNote = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render episode information correctly', () => {
    const { getByText } = render(
      <FavoriteEpisodeCard
        episode={mockEpisode}
        note={null}
        onPress={mockOnPress}
        onEditNote={mockOnEditNote}
        onDeleteNote={mockOnDeleteNote}
      />
    );

    expect(getByText('Test Show')).toBeTruthy();
    expect(getByText('Test Episode')).toBeTruthy();
    expect(getByText('S1E5')).toBeTruthy();
  });

  it('should render note content when provided', () => {
    const { getByText } = render(
      <FavoriteEpisodeCard
        episode={mockEpisode}
        note={mockNote}
        onPress={mockOnPress}
        onEditNote={mockOnEditNote}
        onDeleteNote={mockOnDeleteNote}
      />
    );

    expect(getByText('My test note content')).toBeTruthy();
  });

  it('should call onPress when card is pressed', () => {
    const { getByText } = render(
      <FavoriteEpisodeCard
        episode={mockEpisode}
        note={null}
        onPress={mockOnPress}
        onEditNote={mockOnEditNote}
        onDeleteNote={mockOnDeleteNote}
      />
    );

    fireEvent.press(getByText('Test Episode'));
    expect(mockOnPress).toHaveBeenCalledWith(mockEpisode);
  });
});
