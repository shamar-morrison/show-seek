import {
  AppSettingsSection,
  AppSettingsSectionProps,
} from '@/src/components/profile/AppSettingsSection';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

describe('AppSettingsSection', () => {
  const createProps = (
    overrides: Partial<AppSettingsSectionProps> = {}
  ): AppSettingsSectionProps => ({
    isGuest: false,
    isClearingCache: false,
    onRateApp: jest.fn(),
    onClearCache: jest.fn(),
    onWebApp: jest.fn(),
    onAbout: jest.fn(),
    onDiscord: jest.fn(),
    onTips: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens Tips & Features', () => {
    const props = createProps();
    const { getByTestId, getByText } = render(<AppSettingsSection {...props} />);

    expect(getByText('Tips & Features')).toBeTruthy();
    fireEvent.press(getByTestId('action-button-tips'));
    expect(props.onTips).toHaveBeenCalledTimes(1);
  });

  it("shows What's New when there's an announcement, and opens it", () => {
    const onWhatsNew = jest.fn();
    const { getByTestId, getByText } = render(
      <AppSettingsSection {...createProps({ onWhatsNew })} />
    );

    expect(getByText("What's New")).toBeTruthy();
    fireEvent.press(getByTestId('action-button-whats-new'));
    expect(onWhatsNew).toHaveBeenCalledTimes(1);
  });

  it("hides What's New without an announcement", () => {
    const { queryByTestId } = render(<AppSettingsSection {...createProps()} />);
    expect(queryByTestId('action-button-whats-new')).toBeNull();
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

  it.each([false, true])('leaves account actions to the Account screen (guest: %s)', (isGuest) => {
    const { queryByText } = render(<AppSettingsSection {...createProps({ isGuest })} />);

    expect(queryByText('Export Data')).toBeNull();
    expect(queryByText('Delete Account')).toBeNull();
    expect(queryByText('Sign Out')).toBeNull();
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

  it('renders join discord action button underneath about', () => {
    const props = createProps();
    const { getByText } = render(<AppSettingsSection {...props} />);

    expect(getByText('Join our Discord')).toBeTruthy();
  });

  it('calls onDiscord when join discord action is pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<AppSettingsSection {...props} />);

    fireEvent.press(getByTestId('action-button-join-our-discord'));

    expect(props.onDiscord).toHaveBeenCalledTimes(1);
  });

  it('shows join discord action for guest users', () => {
    const props = createProps({ isGuest: true });
    const { getByText, getByTestId } = render(<AppSettingsSection {...props} />);

    expect(getByText('Join our Discord')).toBeTruthy();

    fireEvent.press(getByTestId('action-button-join-our-discord'));

    expect(props.onDiscord).toHaveBeenCalledTimes(1);
  });

  it('hides clear cache action for guest users', () => {
    const props = createProps({ isGuest: true });
    const { queryByText } = render(<AppSettingsSection {...props} />);

    expect(queryByText('Clear Image Cache')).toBeNull();
  });
});
