import { IntegrationsSection, IntegrationsSectionProps } from '@/src/components/profile/IntegrationsSection';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('@/src/components/icons/TraktLogo', () => ({
  TraktLogo: () => {
    const { View } = require('react-native');
    return <View testID="trakt-logo" />;
  },
}));

jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => {
    const { Text } = require('react-native');
    return <Text testID="premium-badge">Premium</Text>;
  },
}));

describe('IntegrationsSection', () => {
  const createProps = (
    overrides: Partial<IntegrationsSectionProps> = {}
  ): IntegrationsSectionProps => ({
    isPremium: true,
    isTraktConnected: false,
    isTraktLoading: false,
    onImdbImport: jest.fn(),
    onTraktPress: jest.fn(),
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders IMDb and Trakt integration actions', () => {
    const { getByText, getByTestId } = render(<IntegrationsSection {...createProps()} />);

    expect(getByText('Import from IMDb')).toBeTruthy();
    expect(getByText('Trakt Integration')).toBeTruthy();
    expect(getByTestId('integrations-imdb-icon')).toBeTruthy();
    expect(getByTestId('trakt-logo')).toBeTruthy();
  });

  it('calls handlers when the integration buttons are pressed', () => {
    const props = createProps();
    const { getByTestId } = render(<IntegrationsSection {...props} />);

    fireEvent.press(getByTestId('action-button-import-from-imdb'));
    fireEvent.press(getByTestId('action-button-trakt-integration'));

    expect(props.onImdbImport).toHaveBeenCalledTimes(1);
    expect(props.onTraktPress).toHaveBeenCalledTimes(1);
  });

  it('shows the locked premium badge for IMDb import when the user is not premium', () => {
    const { getByTestId } = render(<IntegrationsSection {...createProps({ isPremium: false })} />);

    expect(getByTestId('premium-badge')).toBeTruthy();
  });

  it('shows the Trakt connected badge when connected', () => {
    const { getByTestId } = render(
      <IntegrationsSection {...createProps({ isTraktConnected: true })} />
    );

    expect(getByTestId('integrations-trakt-connected-badge')).toBeTruthy();
  });
});
