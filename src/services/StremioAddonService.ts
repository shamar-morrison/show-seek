import { functions } from '@/src/firebase/config';
import { httpsCallable } from 'firebase/functions';

// The install URL is a bearer credential: never log, persist or attach it to errors.

export class StremioAddonError extends Error {
  constructor(message = 'Stremio addon request failed.') {
    super(message);
    this.name = 'StremioAddonError';
  }
}

export class StremioRateLimitedError extends StremioAddonError {
  constructor(readonly nextAllowedAt?: string) {
    super('Please wait before creating another Stremio link.');
    this.name = 'StremioRateLimitedError';
  }
}

export class StremioAccountRequiredError extends StremioAddonError {
  constructor() {
    super('A signed-in account is required.');
    this.name = 'StremioAccountRequiredError';
  }
}

const getErrorCode = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.replace(/^functions\//, '') : undefined;
};

const mapCallableError = (error: unknown): StremioAddonError => {
  switch (getErrorCode(error)) {
    case 'resource-exhausted': {
      const details = (error as { details?: { nextAllowedAt?: unknown } } | null)?.details;
      return new StremioRateLimitedError(
        typeof details?.nextAllowedAt === 'string' ? details.nextAllowedAt : undefined
      );
    }
    case 'unauthenticated':
      return new StremioAccountRequiredError();
    default:
      return new StremioAddonError();
  }
};

class StremioAddonService {
  private readonly createTokenCallable = httpsCallable<void, { installUrl: string }>(
    functions,
    'createStremioAddonToken'
  );

  private readonly revokeTokenCallable = httpsCallable<void, { success: true }>(
    functions,
    'revokeStremioAddonToken'
  );

  async createInstallLink(): Promise<string> {
    let installUrl: unknown;
    try {
      installUrl = (await this.createTokenCallable()).data?.installUrl;
    } catch (error) {
      throw mapCallableError(error);
    }
    if (typeof installUrl !== 'string' || !installUrl.startsWith('https://')) {
      throw new StremioAddonError();
    }
    return installUrl;
  }

  async revokeLink(): Promise<void> {
    try {
      await this.revokeTokenCallable();
    } catch (error) {
      throw mapCallableError(error);
    }
  }
}

export const stremioAddonService = new StremioAddonService();
