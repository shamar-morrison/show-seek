import { GenrePills } from '@/src/components/detail/GenrePills';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockOpenGenre = jest.fn();
jest.mock('@/src/hooks/useOpenDiscoverGenre', () => ({
  useOpenDiscoverGenre: (mediaType: string) => (id: number) => mockOpenGenre(mediaType, id),
}));

describe('GenrePills', () => {
  const genres = [
    { id: 27, name: 'Horror' },
    { id: 53, name: 'Thriller' },
  ];

  it('shows each genre as a button that opens Discover on it', () => {
    const { getByTestId, getByText } = render(<GenrePills genres={genres} mediaType="movie" />);

    expect(getByText('Horror')).toBeTruthy();
    const thriller = getByTestId('genre-pill-53');
    expect(thriller.props.accessibilityRole).toBe('button');
    expect(thriller.props.accessibilityHint).toBe('Opens Discover filtered by Thriller');

    fireEvent.press(thriller);
    expect(mockOpenGenre).toHaveBeenCalledWith('movie', 53);
  });
});
