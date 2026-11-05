import { AccountPrompt, AccountPromptProps } from '@/src/components/profile/AccountPrompt';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

describe('AccountPrompt', () => {
  const createProps = (overrides: Partial<AccountPromptProps> = {}): AccountPromptProps => ({
    isGuest: false,
    isPremium: false,
    isPremiumLoading: false,
    isSigningOut: false,
    onSignIn: jest.fn(),
    onUpgrade: jest.fn(),
    ...overrides,
  });

  it('asks free users to upgrade', () => {
    const props = createProps();
    const { getByText, getByTestId } = render(<AccountPrompt {...props} />);

    expect(getByText('Upgrade to Premium')).toBeTruthy();

    fireEvent.press(getByTestId('account-prompt-upgrade'));

    expect(props.onUpgrade).toHaveBeenCalledTimes(1);
    expect(props.onSignIn).not.toHaveBeenCalled();
  });

  it('renders nothing for premium users', () => {
    const { toJSON } = render(<AccountPrompt {...createProps({ isPremium: true })} />);

    expect(toJSON()).toBeNull();
  });

  it('renders nothing while premium status resolves, so premium users see no flash', () => {
    const { toJSON } = render(<AccountPrompt {...createProps({ isPremiumLoading: true })} />);

    expect(toJSON()).toBeNull();
  });

  it('asks guests to sign in without waiting on premium status', () => {
    const props = createProps({ isGuest: true, isPremiumLoading: true });
    const { getByText, getByTestId } = render(<AccountPrompt {...props} />);

    expect(getByText('Sign in or create an account')).toBeTruthy();

    fireEvent.press(getByTestId('account-prompt-sign-in'));

    expect(props.onSignIn).toHaveBeenCalledTimes(1);
    expect(props.onUpgrade).not.toHaveBeenCalled();
  });

  it('ignores presses while the guest session is ending', () => {
    const props = createProps({ isGuest: true, isSigningOut: true });
    const { getByTestId } = render(<AccountPrompt {...props} />);

    fireEvent.press(getByTestId('account-prompt-sign-in'));

    expect(props.onSignIn).not.toHaveBeenCalled();
  });
});
