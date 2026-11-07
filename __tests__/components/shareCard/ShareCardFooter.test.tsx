import { ShareCardIdentityRow } from '@/src/components/shareCard/ShareCardFooter';
import { act, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/src/components/ui/UserAvatar', () => ({
  UserAvatar: () => {
    const { Text } = require('react-native');
    return <Text testID="fallback-avatar" />;
  },
}));

const PHOTO = 'https://example.com/me.jpg';
const identity = (photoUrl: string) => ({ displayName: 'Sam', photoUrl });

describe('ShareCardIdentityRow', () => {
  const failPhoto = (utils: ReturnType<typeof render>) => {
    const photo = utils.UNSAFE_getByType('Image' as unknown as React.ComponentType);
    act(() => photo.props.onError());
  };

  it('falls back to the avatar when the photo fails, and stays there on re-render', () => {
    const utils = render(<ShareCardIdentityRow format="portrait" identity={identity(PHOTO)} />);

    failPhoto(utils);
    expect(utils.getByTestId('fallback-avatar')).toBeTruthy();

    utils.rerender(<ShareCardIdentityRow format="portrait" identity={identity(PHOTO)} />);
    expect(utils.getByTestId('fallback-avatar')).toBeTruthy();
  });

  it('tries the photo again when the size changes', () => {
    const utils = render(<ShareCardIdentityRow format="portrait" identity={identity(PHOTO)} />);
    failPhoto(utils);

    utils.rerender(<ShareCardIdentityRow format="square" identity={identity(PHOTO)} />);

    expect(utils.queryByTestId('fallback-avatar')).toBeNull();
  });

  it('tries again when the photo changes', () => {
    const utils = render(<ShareCardIdentityRow format="portrait" identity={identity(PHOTO)} />);
    failPhoto(utils);

    utils.rerender(
      <ShareCardIdentityRow format="portrait" identity={identity('https://example.com/new.jpg')} />
    );

    expect(utils.queryByTestId('fallback-avatar')).toBeNull();
  });
});
