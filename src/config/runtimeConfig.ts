export interface RuntimeConfig {
  version: string;
  firestoreClientEnabled: boolean;
  disableNonCriticalReads: boolean;
  allowGuestFirestoreReads: boolean;
  maintenanceTitle: string;
  maintenanceMessage: string;
  updatedAt: string;
}

export const RUNTIME_CONFIG_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
export const RUNTIME_CONFIG_FETCH_TIMEOUT_MS = 5000;
export const RUNTIME_CONFIG_STORAGE_KEY = 'showseek_runtime_config_v1';

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  version: 'local-default',
  firestoreClientEnabled: true,
  disableNonCriticalReads: false,
  allowGuestFirestoreReads: false,
  maintenanceTitle: 'Maintenance in progress',
  maintenanceMessage: 'Show Seek is temporarily unavailable while we stabilize the service.',
  updatedAt: new Date(0).toISOString(),
};

const normalizeString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

export const normalizeRuntimeConfig = (value: unknown): RuntimeConfig => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    version: normalizeString(raw.version, DEFAULT_RUNTIME_CONFIG.version),
    firestoreClientEnabled: normalizeBoolean(
      raw.firestoreClientEnabled,
      DEFAULT_RUNTIME_CONFIG.firestoreClientEnabled
    ),
    disableNonCriticalReads: normalizeBoolean(
      raw.disableNonCriticalReads,
      DEFAULT_RUNTIME_CONFIG.disableNonCriticalReads
    ),
    allowGuestFirestoreReads: normalizeBoolean(
      raw.allowGuestFirestoreReads,
      DEFAULT_RUNTIME_CONFIG.allowGuestFirestoreReads
    ),
    maintenanceTitle: normalizeString(
      raw.maintenanceTitle,
      DEFAULT_RUNTIME_CONFIG.maintenanceTitle
    ),
    maintenanceMessage: normalizeString(
      raw.maintenanceMessage,
      DEFAULT_RUNTIME_CONFIG.maintenanceMessage
    ),
    updatedAt: normalizeString(raw.updatedAt, new Date().toISOString()),
  };
};

export const getRuntimeConfigUrl = (): string | null => {
  const explicitUrl = process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    return null;
  }

  return `https://${projectId}.web.app/runtime-config.json`;
};

