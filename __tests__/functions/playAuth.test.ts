import {
  PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON,
  PLAY_VALIDATOR_CREDENTIALS_MISSING_REASON,
  getAndroidPublisherClientFromServiceAccountSecret,
  parsePlayValidatorServiceAccountJson,
} from '../../functions/src/shared/playAuth';

const expectHttpsErrorDetails = (error: unknown, expectedReason: string) => {
  const normalizedError = error as {
    code?: string;
    details?: { reason?: string; retryable?: boolean };
  };
  expect(normalizedError.code).toBe('failed-precondition');
  const details = normalizedError.details as { reason?: string; retryable?: boolean };
  expect(details?.reason).toBe(expectedReason);
  expect(details?.retryable).toBe(false);
};

describe('playAuth helper', () => {
  it('throws missing-credentials reason when secret is absent', () => {
    try {
      parsePlayValidatorServiceAccountJson(undefined);
      throw new Error('expected parse to throw for missing secret');
    } catch (error) {
      expectHttpsErrorDetails(error, PLAY_VALIDATOR_CREDENTIALS_MISSING_REASON);
    }
  });

  it('throws invalid-credentials reason for malformed JSON', () => {
    try {
      parsePlayValidatorServiceAccountJson('{not-json');
      throw new Error('expected parse to throw for malformed JSON');
    } catch (error) {
      expectHttpsErrorDetails(error, PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON);
    }
  });

  it('throws invalid-credentials reason when required fields are missing', () => {
    try {
      parsePlayValidatorServiceAccountJson(JSON.stringify({ client_email: 'test@example.com' }));
      throw new Error('expected parse to throw for missing private_key');
    } catch (error) {
      expectHttpsErrorDetails(error, PLAY_VALIDATOR_CREDENTIALS_INVALID_REASON);
    }
  });

  it('normalizes escaped private key newlines from JSON secret', () => {
    const parsed = parsePlayValidatorServiceAccountJson(
      JSON.stringify({
        client_email: 'purchase-validator-showseek@crafty-coral-481307-m4.iam.gserviceaccount.com',
        private_key: 'line-1\\nline-2',
      })
    );

    expect(parsed.clientEmail).toBe(
      'purchase-validator-showseek@crafty-coral-481307-m4.iam.gserviceaccount.com'
    );
    expect(parsed.privateKey).toBe('line-1\nline-2');
  });

  it('builds android publisher client from explicit credentials', () => {
    const client = getAndroidPublisherClientFromServiceAccountSecret(
      JSON.stringify({
        client_email: 'purchase-validator-showseek@crafty-coral-481307-m4.iam.gserviceaccount.com',
        private_key: 'line-1\\nline-2',
      })
    );

    expect(client).toBeTruthy();
  });
});
