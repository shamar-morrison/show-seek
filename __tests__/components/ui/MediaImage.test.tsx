import { MediaImage } from '@/src/components/ui/MediaImage';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-image', () => ({ Image: 'Image' }));

describe('MediaImage', () => {
  const source = { uri: 'https://example.com/a.jpg' };

  it('redraws when only the content position changes', () => {
    const { getByTestId, rerender } = render(
      <MediaImage source={source} contentPosition={{ left: '50%', top: '0%' }} testID="img" />
    );

    rerender(
      <MediaImage source={source} contentPosition={{ left: '50%', top: '40%' }} testID="img" />
    );

    expect(getByTestId('img').props.contentPosition).toEqual({ left: '50%', top: '40%' });
  });

  it('treats an equal position object built on a new render as unchanged', () => {
    const { getByTestId, rerender } = render(
      <MediaImage source={source} contentPosition={{ left: '50%', top: '0%' }} testID="img" />
    );
    const first = getByTestId('img').props.contentPosition;

    rerender(
      <MediaImage source={source} contentPosition={{ left: '50%', top: '0%' }} testID="img" />
    );

    // Skipped as a re-render, so the element still holds the first object.
    expect(getByTestId('img').props.contentPosition).toBe(first);
  });
});
