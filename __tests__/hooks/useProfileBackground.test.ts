import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import { renderHook } from '@testing-library/react-native';

const mockMutateAsync = jest.fn(() => Promise.resolve());
jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { profileBackground: null } }),
  useUpdatePreference: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

describe('useProfileBackground', () => {
  beforeEach(() => mockMutateAsync.mockClear());

  it("always saves a focus, so a new image doesn't keep the old image's", async () => {
    const { result } = renderHook(() => useProfileBackground());

    await result.current.setProfileBackground({ path: '/p.jpg', kind: 'poster' });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: 'profileBackground',
      value: { path: '/p.jpg', kind: 'poster', focus: { x: 0.5, y: 0 } },
    });
  });

  it('keeps a chosen focus and removes with null', async () => {
    const { result } = renderHook(() => useProfileBackground());

    await result.current.setProfileBackground({
      path: '/b.jpg',
      kind: 'backdrop',
      focus: { x: 0.1, y: 0.2 },
    });
    await result.current.setProfileBackground(null);

    expect(mockMutateAsync).toHaveBeenNthCalledWith(1, {
      key: 'profileBackground',
      value: { path: '/b.jpg', kind: 'backdrop', focus: { x: 0.1, y: 0.2 } },
    });
    expect(mockMutateAsync).toHaveBeenNthCalledWith(2, { key: 'profileBackground', value: null });
  });
});
