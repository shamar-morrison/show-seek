import { FilterSelect, isUnsetSelectValue } from '@/src/components/filters/FilterSelect';
import { SHEET_SAFE_PRESS_RETENTION } from '@/src/constants/sheetTouch';
import { COLORS } from '@/src/constants/theme';
import { render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

const runtimeOptions = [
  { label: 'Any runtime', value: 'any' },
  { label: 'Under 30 min', value: 'under30' },
];

const textColor = (getByText: (text: string) => any, text: string) =>
  StyleSheet.flatten(getByText(text).props.style).color;

describe('isUnsetSelectValue', () => {
  it('follows isActive when a filter provides it', () => {
    expect(isUnsetSelectValue('any', false)).toBe(true);
    expect(isUnsetSelectValue('under30', true)).toBe(false);
    expect(isUnsetSelectValue(null, false)).toBe(true);
  });

  it('treats null and 0 as unset without isActive', () => {
    expect(isUnsetSelectValue(null, undefined)).toBe(true);
    expect(isUnsetSelectValue(0, undefined)).toBe(true);
    expect(isUnsetSelectValue('desc', undefined)).toBe(false);
  });
});

describe('FilterSelect', () => {
  it('mutes a default that is a real option, like "Any runtime"', () => {
    const { getAllByText } = render(
      <FilterSelect
        label="Runtime"
        value="any"
        options={runtimeOptions}
        onSelect={jest.fn()}
        isActive={false}
      />
    );
    expect(textColor((t) => getAllByText(t)[0], 'Any runtime')).toBe(COLORS.textSecondary);
  });

  it('shows a chosen runtime in full color', () => {
    const { getAllByText } = render(
      <FilterSelect
        label="Runtime"
        value="under30"
        options={runtimeOptions}
        onSelect={jest.fn()}
        isActive
      />
    );
    expect(textColor((t) => getAllByText(t)[0], 'Under 30 min')).not.toBe(COLORS.textSecondary);
  });

  it('keeps an always-set select without isActive in full color', () => {
    const { getAllByText } = render(
      <FilterSelect
        label="Order"
        value="desc"
        options={[{ label: 'Descending', value: 'desc' }]}
        onSelect={jest.fn()}
      />
    );
    expect(textColor((t) => getAllByText(t)[0], 'Descending')).not.toBe(COLORS.textSecondary);
  });

  it('keeps a jittery tap from being cancelled inside a bottom sheet', () => {
    const { UNSAFE_getAllByType } = render(
      <FilterSelect
        label="Runtime"
        value="any"
        options={runtimeOptions}
        onSelect={jest.fn()}
        isActive={false}
      />
    );
    // The first touchable is the button that opens the options.
    expect(UNSAFE_getAllByType(TouchableOpacity)[0].props.pressRetentionOffset).toBe(
      SHEET_SAFE_PRESS_RETENTION
    );
  });
});

describe('SHEET_SAFE_PRESS_RETENTION', () => {
  it('reaches well past any on-screen offset between a sheet and the screen', () => {
    for (const side of Object.values(SHEET_SAFE_PRESS_RETENTION)) {
      expect(side).toBeGreaterThanOrEqual(4000);
    }
  });
});
