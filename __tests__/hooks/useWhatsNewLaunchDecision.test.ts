import { renderHook, waitFor } from '@testing-library/react-native';

const mockShouldShow = jest.fn();
const mockMarkSeen = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@/src/services/whatsNewService', () => ({
  shouldShowWhatsNew: (...args: unknown[]) => mockShouldShow(...args),
  markWhatsNewSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));
jest.mock('@/src/constants/whatsNew', () => ({
  CURRENT_WHATS_NEW: { id: 'nov', sections: [] },
}));

import { resetWhatsNewLaunchDecision, useWhatsNew } from '@/src/hooks/useWhatsNew';

describe('useWhatsNew launch decision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetWhatsNewLaunchDecision();
  });

  it('decides once per launch and gives every user of the hook the same answer', async () => {
    // The first read says show; once the sheet marks it seen, a fresh read would say don't.
    mockShouldShow.mockResolvedValueOnce(true).mockResolvedValue(false);

    const sheet = renderHook(() => useWhatsNew());
    await waitFor(() => expect(sheet.result.current.shouldShow).toBe(true));
    sheet.result.current.markSeen();

    // Home mounts later in the same launch (e.g. the app opened on Library).
    const home = renderHook(() => useWhatsNew());
    await waitFor(() => expect(home.result.current.shouldShow).toBe(true));

    expect(mockShouldShow).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith('nov');
  });

  it('reads again on the next launch', async () => {
    mockShouldShow.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const first = renderHook(() => useWhatsNew());
    await waitFor(() => expect(first.result.current.shouldShow).toBe(true));

    resetWhatsNewLaunchDecision();
    const next = renderHook(() => useWhatsNew());
    await waitFor(() => expect(next.result.current.shouldShow).toBe(false));
  });
});
