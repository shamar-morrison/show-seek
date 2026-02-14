import AboutScreen from '@/app/(tabs)/profile/about';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders app details and attribution content', () => {
    const { getByText, queryByText } = render(<AboutScreen />);

    expect(getByText('ShowSeek')).toBeTruthy();
    expect(getByText('Version 1.0.0')).toBeTruthy();
    expect(queryByText('Copyright 2026 Placeholder Name')).toBeNull();
    expect(
      getByText('ShowSeek uses the TMDB API but is not endorsed or certified by TMDB')
    ).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
    expect(getByText('Terms of Service')).toBeTruthy();
  });

  it('opens privacy and terms links', async () => {
    const { getByText } = render(<AboutScreen />);

    fireEvent.press(getByText('Privacy Policy'));
    fireEvent.press(getByText('Terms of Service'));

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://privacy-policies-psi.vercel.app/show-seek/privacy'
      );
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://privacy-policies-psi.vercel.app/show-seek/terms'
      );
    });
  });
});
