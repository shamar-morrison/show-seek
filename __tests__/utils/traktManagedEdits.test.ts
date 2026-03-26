describe('traktManagedEdits', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('does not consume the one-time warning when no toast handler is available', () => {
    const showToast = jest.fn();

    jest.isolateModules(() => {
      const { maybeWarnTraktManagedRatingEdit } = require('@/src/utils/traktManagedEdits');

      maybeWarnTraktManagedRatingEdit(true, undefined, 'Managed by Trakt');
      maybeWarnTraktManagedRatingEdit(true, showToast, 'Managed by Trakt');
      maybeWarnTraktManagedRatingEdit(true, showToast, 'Managed by Trakt');
    });

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Managed by Trakt');
  });
});
