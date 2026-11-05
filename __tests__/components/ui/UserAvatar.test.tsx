import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

describe('UserAvatar', () => {
  it('shows no premium markers by default', () => {
    const { queryByTestId } = render(<UserAvatar displayName="Kevin Smith" size={32} />);

    expect(queryByTestId('user-avatar-premium-ring')).toBeNull();
    expect(queryByTestId('user-avatar-premium-badge')).toBeNull();
  });

  it('keeps the badge without a ring for showPremiumBadge', () => {
    const { getByTestId, queryByTestId } = render(
      <UserAvatar displayName="Kevin Smith" size={60} showPremiumBadge />
    );

    expect(getByTestId('user-avatar-premium-badge')).toBeTruthy();
    expect(queryByTestId('user-avatar-premium-ring')).toBeNull();
  });

  it('shows both the ring and the crown for showPremiumRing', () => {
    const { getByTestId } = render(
      <UserAvatar displayName="Kevin Smith" size={32} showPremiumRing />
    );

    expect(getByTestId('user-avatar-premium-ring')).toBeTruthy();
    expect(getByTestId('user-avatar-premium-badge')).toBeTruthy();
  });

  it('shows a person icon instead of initials for guests', () => {
    const { getByTestId, queryByText } = render(
      <UserAvatar displayName="Kevin Smith" size={32} isGuest />
    );

    expect(getByTestId('user-avatar-guest')).toBeTruthy();
    expect(queryByText('KS')).toBeNull();
  });

  it('shows initials when there is no photo', () => {
    const { getByText, queryByTestId } = render(<UserAvatar displayName="Kevin Smith" size={32} />);

    expect(getByText('KS')).toBeTruthy();
    expect(queryByTestId('user-avatar-guest')).toBeNull();
  });
});
