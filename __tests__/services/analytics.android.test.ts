const mockLogEvent = jest.fn();
const mockLogScreenView = jest.fn();
const mockSetAnalyticsCollectionEnabled = jest.fn();

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  default: () => ({
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    logScreenView: (...args: unknown[]) => mockLogScreenView(...args),
    setAnalyticsCollectionEnabled: (...args: unknown[]) =>
      mockSetAnalyticsCollectionEnabled(...args),
  }),
}));

describe('analytics.android wrappers', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockSetAnalyticsCollectionEnabled.mockResolvedValue(undefined);
    mockLogEvent.mockResolvedValue(undefined);
    mockLogScreenView.mockResolvedValue(undefined);
  });

  const loadModule = () =>
    require('@/src/services/analytics.android') as typeof import('@/src/services/analytics.android');

  // Verifies each audited analytics wrapper emits the exact Firebase event name expected by downstream dashboards.
  it('uses the expected Firebase event names for audited wrappers', async () => {
    const analytics = loadModule();

    await analytics.trackSignOut();
    await analytics.trackPurchaseSuccess({
      plan: 'monthly',
      productId: 'monthly_showseek_sub',
      price: 3,
      currency: 'USD',
    });
    await analytics.trackPurchaseFailure({
      plan: 'monthly',
      productId: 'monthly_showseek_sub',
      reason: 'cancelled',
      code: 'USER_CANCELLED',
    });
    await analytics.trackRestoreSuccess({
      productId: 'monthly_showseek_sub',
      restoredPremium: true,
    });
    await analytics.trackRestoreFailure({
      reason: 'network',
      code: 'NETWORK',
    });
    await analytics.trackOnboardingComplete({
      language: 'en-US',
      region: 'US',
      favoriteMovieGenreCount: 2,
      favoriteTVGenreCount: 1,
      favoriteShowCount: 3,
    });
    await analytics.trackTraktConnect();
    await analytics.trackTraktSyncComplete({ itemsSynced: 42 });
    await analytics.trackTraktSyncFailure({ category: 'rate_limited' });
    await analytics.trackImdbImportComplete({
      processedActions: 10,
      processedEntities: 6,
    });
    await analytics.trackImdbImportFailure({ errorCode: 'UPLOAD_FAILED' });

    expect(mockLogEvent.mock.calls.map(([eventName]) => eventName)).toEqual([
      'sign_out',
      'purchase_success',
      'purchase_failure',
      'restore_success',
      'restore_failure',
      'onboarding_complete',
      'trakt_connect',
      'trakt_sync_complete',
      'trakt_sync_failure',
      'imdb_import_complete',
      'imdb_import_failure',
    ]);
  });

  // Verifies each wrapper maps its input fields into the correct Firebase parameter keys and value types.
  it('maps wrapper parameters into the expected Firebase analytics params', async () => {
    const analytics = loadModule();

    await analytics.trackPurchaseSuccess({
      plan: 'yearly',
      productId: 'showseek_yearly_sub',
      price: 12,
      currency: 'USD',
    });
    await analytics.trackPurchaseFailure({
      plan: 'monthly',
      productId: null,
      reason: 'network',
      code: null,
    });
    await analytics.trackRestoreSuccess({
      productId: null,
      restoredPremium: false,
    });
    await analytics.trackRestoreFailure({
      reason: 'timeout',
      code: 'TIMEOUT',
    });
    await analytics.trackOnboardingComplete({
      language: 'fr-FR',
      region: 'CA',
      favoriteMovieGenreCount: 3,
      favoriteTVGenreCount: 2,
      favoriteShowCount: 4,
    });
    await analytics.trackTraktSyncComplete({ itemsSynced: 9 });
    await analytics.trackTraktSyncFailure({ category: 'locked_account' });
    await analytics.trackImdbImportComplete({
      processedActions: 18,
      processedEntities: 7,
    });
    await analytics.trackImdbImportFailure({ errorCode: 'PARSE_FAILED' });

    expect(mockLogEvent).toHaveBeenNthCalledWith(1, 'purchase_success', {
      currency: 'USD',
      plan: 'yearly',
      price: 12,
      product_id: 'showseek_yearly_sub',
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(2, 'purchase_failure', {
      code: 'unknown',
      plan: 'monthly',
      product_id: 'unknown',
      reason: 'network',
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(3, 'restore_success', {
      product_id: 'unknown',
      restored_premium: 0,
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(4, 'restore_failure', {
      code: 'TIMEOUT',
      reason: 'timeout',
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(5, 'onboarding_complete', {
      favorite_movie_genre_count: 3,
      favorite_show_count: 4,
      favorite_tv_genre_count: 2,
      language: 'fr-FR',
      region: 'CA',
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(6, 'trakt_sync_complete', {
      items_synced: 9,
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(7, 'trakt_sync_failure', {
      category: 'locked_account',
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(8, 'imdb_import_complete', {
      processed_actions: 18,
      processed_entities: 7,
    });
    expect(mockLogEvent).toHaveBeenNthCalledWith(9, 'imdb_import_failure', {
      error_code: 'PARSE_FAILED',
    });
  });

  // Verifies events do not fire before Firebase analytics initialization succeeds and are safely ignored when init fails.
  it('waits for Firebase initialization before logging and skips events if init fails', async () => {
    const analytics = loadModule();
    const initController: { resolve: (() => void) | null } = {
      resolve: null,
    };
    mockSetAnalyticsCollectionEnabled.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          initController.resolve = () => resolve();
        })
    );

    const pendingTrack = analytics.trackSignOut();

    expect(mockLogEvent).not.toHaveBeenCalled();

    if (typeof initController.resolve === 'function') {
      initController.resolve();
    }
    await pendingTrack;

    expect(mockLogEvent).toHaveBeenCalledWith('sign_out', undefined);

    jest.resetModules();
    mockLogEvent.mockClear();
    mockSetAnalyticsCollectionEnabled.mockRejectedValueOnce(new Error('init failed'));

    const failedAnalytics = loadModule();
    await failedAnalytics.trackSignOut();

    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
