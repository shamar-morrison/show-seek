import { AppSettingsSection, AppSettingsSectionProps } from '@/src/components/profile/AppSettingsSection';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

describe('AppSettingsSection', () => {
  const createProps = (
    overrides: Partial<AppSettingsSectionProps> = {}
  ): AppSettingsSectionProps => ({
    isGuest: false,
    isPremium: true,
    isExporting: false,
    isClearingCache: false,
    isSigningOut: false,
    onRateApp: jest.fn(),
    onFeedback: jest.fn(),
    onExportData: jest.fn(),
    onClearCache: jest.fn(),
    onWebApp: jest.fn(),
    onAbout: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders clear cache action button', () => {
    const props = createProps();
    const { getByText } = render(<AppSettingsSection {...props} />);

    expect(getByText('Clear Image Cache')).toBeTruthy();
  });

  it('calls onClearCache when clear cache action is pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    fireEvent.press(getByTestId('action-button-clear-image-cache'));

    expect(props.onClearCache).toHaveBeenCalledTimes(1);
  });

  it('shows loading state and disables clear cache action while clearing', () => {
    const props = createProps({ isClearingCache: true });
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    expect(getByTestId('action-button-spinner')).toBeTruthy();

    fireEvent.press(getByTestId('action-button-clear-image-cache'));

    expect(props.onClearCache).not.toHaveBeenCalled();
  });

  it('calls onSignOut when sign out action is pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    fireEvent.press(getByTestId('action-button-sign-out'));

    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders about action button', () => {
    const props = createProps();
    const { getByText } = render(<AppSettingsSection {...props} />);

    expect(getByText('About')).toBeTruthy();
  });

  it('calls onAbout when about action is pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    fireEvent.press(getByTestId('action-button-about'));

    expect(props.onAbout).toHaveBeenCalledTimes(1);
  });

  it('shows signing out state and disables sign out action while signing out', () => {
    const props = createProps({ isSigningOut: true });
    const { getByText, getByTestId } = render(<AppSettingsSection {...props} />);

    expect(getByText('Signing Out...')).toBeTruthy();
    expect(getByTestId('action-button-spinner')).toBeTruthy();

    fireEvent.press(getByTestId('action-button-signing-out...'));

    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('hides export and clear cache actions for guest users', () => {
    const props = createProps({ isGuest: true });
    const { queryByText } = render(<AppSettingsSection {...props} />);

    expect(queryByText('Export Data')).toBeNull();
    expect(queryByText('Clear Image Cache')).toBeNull();
  });
});
