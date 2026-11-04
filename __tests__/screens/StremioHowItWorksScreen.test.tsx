import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

import StremioHowItWorksScreen from '@/src/screens/StremioHowItWorksScreen';

describe('StremioHowItWorksScreen', () => {
  it('shows the computer-only notice, the flow, every question and troubleshooting tips', () => {
    const { getByTestId, getByText } = render(<StremioHowItWorksScreen />);

    expect(getByTestId('stremio-platform-notice')).toBeTruthy();
    expect(getByText(/The Android and iOS apps aren't supported yet\./)).toBeTruthy();
    expect(getByText('You watch in Stremio')).toBeTruthy();
    expect(getByText('Marked as watched')).toBeTruthy();

    for (const key of ['watched', 'updates', 'devices', 'anime', 'privacy', 'stop']) {
      expect(getByTestId(`stremio-faq-${key}`)).toBeTruthy();
    }
    expect(getByText('When does something count as watched?')).toBeTruthy();
    expect(getByText(/after watching at least 80%/)).toBeTruthy();
    expect(getByText('Not seeing your watches?')).toBeTruthy();
  });
});
