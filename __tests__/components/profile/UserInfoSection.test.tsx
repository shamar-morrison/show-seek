import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockUserAvatar = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('@/src/components/ui/UserAvatar', () => ({
  UserAvatar: (props: Record<string, unknown>) => mockUserAvatar(props),
}));

describe('UserInfoSection', () => {
  beforeEach(() => {
    mockUserAvatar.mockClear();
  });

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
      />
    );

    expect(getByText('Guest User')).toBeTruthy();
    expect(queryByText('guest.user')).toBeNull();
    expect(queryByText('guest.user@example.com')).toBeNull();
    expect(mockUserAvatar).toHaveBeenCalledWith(expect.objectContaining({ isGuest: true }));
  });

  it('shows the premium status and ring for premium members', () => {
    const { getByText } = render(
      <UserInfoSection
        user={{ displayName: 'Kevin', email: 'kevin@example.com', photoURL: null } as any}
        isGuest={false}
        isPremium={true}
      />
    );

    expect(getByText('Premium Member')).toBeTruthy();
    expect(mockUserAvatar).toHaveBeenCalledWith(expect.objectContaining({ showPremiumRing: true }));
  });

  it('hides the premium status for free users', () => {
    const { queryByText } = render(
      <UserInfoSection
        user={{ displayName: 'Kevin', email: 'kevin@example.com', photoURL: null } as any}
        isGuest={false}
        isPremium={false}
      />
    );

    expect(queryByText('Premium Member')).toBeNull();
  });
});
