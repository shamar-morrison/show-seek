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
    onRateApp: jest.fn(),
    onFeedback: jest.fn(),
    onExportData: jest.fn(),
    onClearCache: jest.fn(),
    onWebApp: jest.fn(),
    onSignOut: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders clear cache action button', () => {
    const props = createProps();
    const { getByText } = render(<AppSettingsSection {...props} />);

    expect(getByText('Clear Cache')).toBeTruthy();
  });

  it('calls onClearCache when clear cache action is pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    fireEvent.press(getByTestId('action-button-clear-cache'));

    expect(props.onClearCache).toHaveBeenCalledTimes(1);
  });

  it('shows loading state and disables clear cache action while clearing', () => {
    const props = createProps({ isClearingCache: true });
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    expect(getByTestId('action-button-spinner')).toBeTruthy();

    fireEvent.press(getByTestId('action-button-clear-cache'));

    expect(props.onClearCache).not.toHaveBeenCalled();
  });
});
