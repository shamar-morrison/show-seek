import { HttpsError } from 'firebase-functions/v2/https';
import { androidpublisher_v3, google } from 'googleapis';

export const PLAY_VALIDATOR_CREDENTIALS_MISSING_REASON = 'PLAY_VALIDATOR_CREDENTIALS_MISSING';
export const PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON = 'PLAY_VALIDATOR_CREDENTIALS_INVALID';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface RawServiceAccountCredentials {
  client_email?: unknown;
  private_key?: unknown;
}

interface ParsedServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

const throwCredentialConfigError = (reason: string, message: string): never => {
  throw new HttpsError('failed-precondition', message, {
    code: reason,
    reason,
    retryable: false,
  });
};

export const parsePlayValidatorServiceAccountJson = (
  secretValue?: string
): ParsedServiceAccountCredentials => {
  const providedSecretValue = secretValue ?? '';
  if (!providedSecretValue.trim()) {
    throwCredentialConfigError(
      PLAY_VALIDATOR_CREDENTIALS_MISSING_REASON,
      'Play validator service account secret is not configured.'
    );
  }
  const rawSecret = providedSecretValue.trim();

  const parsedSecret = (() => {
    try {
      return JSON.parse(rawSecret) as RawServiceAccountCredentials;
    } catch {
      return throwCredentialConfigError(
        PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON,
        'Play validator service account secret contains invalid JSON.'
      );
    }
  })();

  const clientEmail = typeof parsedSecret.client_email === 'string' ? parsedSecret.client_email : '';
  const privateKeyRaw = typeof parsedSecret.private_key === 'string' ? parsedSecret.private_key : '';

  if (!clientEmail.trim() || !privateKeyRaw.trim()) {
    throwCredentialConfigError(
      PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON,
      'Play validator service account secret is missing client_email or private_key.'
    );
  }

  return {
    clientEmail: clientEmail.trim(),
    privateKey: privateKeyRaw.replace(/\\n/g, '\n').trim(),
  };
};

export const getAndroidPublisherClientFromServiceAccountSecret = (
  secretValue?: string
): androidpublisher_v3.Androidpublisher => {
  const credentials = parsePlayValidatorServiceAccountJson(secretValue);
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: credentials.privateKey,
    },
    scopes: [ANDROID_PUBLISHER_SCOPE],
  });

  return google.androidpublisher({
    version: 'v3',
    auth,
  });
};
