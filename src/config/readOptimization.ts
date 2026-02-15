const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parseNumberEnv = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isDevelopmentRuntime =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.NODE_ENV !== 'production';

export const READ_OPTIMIZATION_FLAGS = {
  liteModeEnabled: parseBooleanEnv(process.env.EXPO_PUBLIC_FIRESTORE_LITE_MODE, true),
  enableRealtimeStatusListeners: parseBooleanEnv(
    process.env.EXPO_PUBLIC_ENABLE_REALTIME_STATUS_LISTENERS,
    false
  ),
  enableStartupReminderSync: parseBooleanEnv(
    process.env.EXPO_PUBLIC_ENABLE_STARTUP_REMINDER_SYNC,
    false
  ),
  enablePremiumRealtimeListener: parseBooleanEnv(
    process.env.EXPO_PUBLIC_ENABLE_PREMIUM_REALTIME_LISTENER,
    true
  ),
  includeCustomListsInMembershipChecks: parseBooleanEnv(
    process.env.EXPO_PUBLIC_INCLUDE_CUSTOM_LIST_MEMBERSHIP,
    false
  ),
  enableListIndicatorsInLiteMode: parseBooleanEnv(
    process.env.EXPO_PUBLIC_ENABLE_LIST_INDICATORS_IN_LITE_MODE,
    false
  ),
  nonCriticalReadBudgetPerSession: parseNumberEnv(
    process.env.EXPO_PUBLIC_NON_CRITICAL_READ_BUDGET,
    120
  ),
  initTimeoutMs: parseNumberEnv(process.env.EXPO_PUBLIC_INIT_TIMEOUT_MS, 3000),
  debugInitGateLogs: parseBooleanEnv(
    process.env.EXPO_PUBLIC_DEBUG_INIT_GATE_LOGS,
    isDevelopmentRuntime
  ),
  debugInitTimeoutMs: parseNumberEnv(process.env.EXPO_PUBLIC_DEBUG_INIT_TIMEOUT_MS, 5000),
  debugEnableTimeoutEscapeHatch: parseBooleanEnv(
    process.env.EXPO_PUBLIC_DEBUG_ENABLE_TIMEOUT_ESCAPE_HATCH,
    isDevelopmentRuntime
  ),
  debugDisableAuthTransitionCacheClear: parseBooleanEnv(
    process.env.EXPO_PUBLIC_DEBUG_DISABLE_AUTH_TRANSITION_CACHE_CLEAR,
    false
  ),
  debugDisableReadAuditGlobalSetup: parseBooleanEnv(
    process.env.EXPO_PUBLIC_DEBUG_DISABLE_READ_AUDIT_GLOBAL_SETUP,
    false
  ),
  debugDisableAppStateAuditLogging: parseBooleanEnv(
    process.env.EXPO_PUBLIC_DEBUG_DISABLE_APPSTATE_AUDIT_LOGGING,
    false
  ),
  enableReadAuditLogging: parseBooleanEnv(process.env.EXPO_PUBLIC_ENABLE_READ_AUDIT_LOGGING, true),
  enableServiceQueryDebugLogs: parseBooleanEnv(
    process.env.EXPO_PUBLIC_ENABLE_SERVICE_QUERY_DEBUG_LOGS,
    false
  ),
} as const;

export const READ_QUERY_CACHE_WINDOWS = {
  statusStaleTimeMs: parseNumberEnv(process.env.EXPO_PUBLIC_STATUS_STALE_TIME_MS, 5 * 60 * 1000),
  statusGcTimeMs: parseNumberEnv(process.env.EXPO_PUBLIC_STATUS_GC_TIME_MS, 30 * 60 * 1000),
  listIndicatorsStaleTimeMs: parseNumberEnv(
    process.env.EXPO_PUBLIC_LIST_INDICATORS_STALE_TIME_MS,
    15 * 60 * 1000
  ),
  listIndicatorsGcTimeMs: parseNumberEnv(
    process.env.EXPO_PUBLIC_LIST_INDICATORS_GC_TIME_MS,
    60 * 60 * 1000
  ),
  preferencesStaleTimeMs: 30 * 60 * 1000,
  preferencesGcTimeMs: 24 * 60 * 60 * 1000,
} as const;
