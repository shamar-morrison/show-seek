import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('@/src/components/ui/UserAvatar', () => ({
  UserAvatar: () => null,
}));

describe('UserInfoSection', () => {
  it('falls back to the email prefix when the auth display name is blank', () => {
    const { getByText } = render(
      <UserInfoSection
        user={
          {
            displayName: '   ',
            email: 'fallback.user@example.com',
            photoURL: null,
          } as any
        }
        isGuest={false}
        isPremium={false}
        onUpgradePress={jest.fn()}
        onSignOut={jest.fn()}
      />
    );

    expect(getByText('fallback.user')).toBeTruthy();
    expect(getByText('fallback.user@example.com')).toBeTruthy();
  });

  it('preserves the guest label instead of using an email-derived fallback', () => {
    const { getByText, queryByText } = render(
      <UserInfoSection
        user={
          {
            displayName: '   ',
            email: 'guest.user@example.com',
            photoURL: null,
          } as any
        }
        isGuest={true}
        isPremium={false}
        onUpgradePress={jest.fn()}
        onSignOut={jest.fn()}
      />
    );

    expect(getByText('Guest User')).toBeTruthy();
    expect(queryByText('guest.user')).toBeNull();
    expect(queryByText('guest.user@example.com')).toBeNull();
  });
});
