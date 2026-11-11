import {
  deviceUses24HourClock,
  formatDateTime,
  setPreferred24HourClock,
  uses24HourClock,
} from '@/src/utils/timeFormat';

let mockUses24hourClock: boolean | null = null;
let mockThrows = false;

jest.mock('expo-localization', () => ({
  getCalendars: () => {
    if (mockThrows) throw new Error('native module missing');
    return [{ uses24hourClock: mockUses24hourClock }];
  },
}));

// 12 Nov 2026, 21:05 in the test machine's time zone.
const evening = new Date(2026, 10, 12, 21, 5);
const shortDateTime = {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
} as const;

describe('formatDateTime', () => {
  beforeEach(() => {
    mockUses24hourClock = null;
    mockThrows = false;
    setPreferred24HourClock(undefined);
  });

  it('uses a 24-hour clock in English when the phone is set to 24-hour', () => {
    mockUses24hourClock = true;
    const text = formatDateTime(evening, 'en-US', shortDateTime);
    expect(text).toContain('21:05');
    expect(text).not.toMatch(/PM/i);
  });

  it('uses a 12-hour clock in French when the phone is set to 12-hour', () => {
    mockUses24hourClock = false;
    const text = formatDateTime(evening, 'fr-FR', shortDateTime);
    expect(text).toContain('9:05');
    expect(text).not.toContain('21:05');
  });

  it("falls back to the language's convention when the phone setting is unknown", () => {
    expect(formatDateTime(evening, 'en-US', shortDateTime)).toMatch(/9:05\s?PM/);
    expect(formatDateTime(evening, 'fr-FR', shortDateTime)).toContain('21:05');
  });

  it('falls back when expo-localization is unavailable', () => {
    mockThrows = true;
    expect(deviceUses24HourClock()).toBeUndefined();
    expect(formatDateTime(evening, 'en-US', shortDateTime)).toMatch(/9:05\s?PM/);
  });

  it('keeps the default date and time layout without options', () => {
    mockUses24hourClock = true;
    const text = formatDateTime(evening.getTime(), 'en-US');
    expect(text).toContain('2026');
    expect(text).toContain('21:05');
  });

  it("lets the person's choice override the phone, either way", () => {
    mockUses24hourClock = false;
    setPreferred24HourClock(true);
    expect(formatDateTime(evening, 'en-US', shortDateTime)).toContain('21:05');

    mockUses24hourClock = true;
    setPreferred24HourClock(false);
    expect(formatDateTime(evening, 'fr-FR', shortDateTime)).not.toContain('21:05');
  });

  it("goes back to the phone's setting when the choice is cleared", () => {
    mockUses24hourClock = true;
    setPreferred24HourClock(false);
    expect(uses24HourClock()).toBe(false);

    setPreferred24HourClock(undefined);
    expect(uses24HourClock()).toBe(true);
  });
});
