import { TIP_SECTIONS } from '@/src/constants/tips';
import { render, within } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

import TipsScreen from '@/app/(tabs)/profile/tips';

describe('TipsScreen', () => {
  it('shows every section and tip, with real text for each', () => {
    const { getByTestId, getAllByText, toJSON } = render(<TipsScreen />);

    for (const section of TIP_SECTIONS) {
      const sectionNode = getByTestId(`tips-section-${section.id}`);
      for (const tip of section.tips) {
        expect(within(sectionNode).getByTestId(`tip-${tip.id}`)).toBeTruthy();
      }
    }
    // A missing string would render as its key.
    expect(JSON.stringify(toJSON())).not.toMatch(/tips\.(items|sections)\./);
    expect(getAllByText('Add to a list from anywhere')).toHaveLength(1);
  });

  it('has no duplicate tip ids', () => {
    const ids = TIP_SECTIONS.flatMap((section) => section.tips.map((tip) => tip.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
