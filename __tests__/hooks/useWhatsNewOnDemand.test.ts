import { act, renderHook } from '@testing-library/react-native';

const mockMarkSeen = jest.fn(() => Promise.resolve());
jest.mock('@/src/services/whatsNewService', () => ({
  markWhatsNewSeen: (...args: unknown[]) => mockMarkSeen(...args),
  shouldShowWhatsNew: jest.fn(() => Promise.resolve(false)),
}));

let mockAnnouncement: { id: string; sections: unknown[] } | null = { id: 'nov', sections: [] };
jest.mock('@/src/constants/whatsNew', () => ({
  get CURRENT_WHATS_NEW() {
    return mockAnnouncement;
  },
}));

import { useWhatsNewOnDemand } from '@/src/hooks/useWhatsNew';

describe('useWhatsNewOnDemand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnnouncement = { id: 'nov', sections: [] };
  });

  it('opens the current announcement and can open it again after closing', () => {
    const { result } = renderHook(() => useWhatsNewOnDemand());
    expect(result.current.openAnnouncement).toBeNull();

    act(() => result.current.open?.());
    expect(result.current.openAnnouncement).toEqual({ id: 'nov', sections: [] });

    act(() => result.current.handleDismiss());
    expect(result.current.openAnnouncement).toBeNull();

    act(() => result.current.open?.());
    expect(result.current.openAnnouncement).not.toBeNull();
  });

  it('marks the announcement seen when closed, so Home does not show it again', () => {
    const { result } = renderHook(() => useWhatsNewOnDemand());

    act(() => result.current.open?.());
    act(() => result.current.handleDismiss());

    expect(mockMarkSeen).toHaveBeenCalledWith('nov');
  });

  it('offers nothing to open without an announcement', () => {
    mockAnnouncement = null;
    const { result } = renderHook(() => useWhatsNewOnDemand());
    expect(result.current.open).toBeUndefined();
  });
});
