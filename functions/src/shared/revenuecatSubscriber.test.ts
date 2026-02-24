import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTransientRevenueCatError,
  resolveRevenueCatPremiumState,
} from './revenuecatSubscriber';

describe('resolveRevenueCatPremiumState', () => {
  it('treats rc_promo_premium_lifetime as premium lifetime', () => {
    const state = resolveRevenueCatPremiumState(
      {
        non_subscriptions: {
          rc_promo_premium_lifetime: [
            {
              purchase_date: '2026-02-17T05:28:00Z',
            },
          ],
        },
      },
      Date.parse('2026-02-24T00:00:00Z')
    );

    assert.equal(state.isPremium, true);
    assert.equal(state.entitlementType, 'lifetime');
    assert.equal(state.productId, 'rc_promo_premium_lifetime');
  });

  it('resolves active premium entitlement as premium subscription', () => {
    const state = resolveRevenueCatPremiumState(
      {
        entitlements: {
          premium: {
            expires_date: '2026-03-24T00:00:00Z',
            period_type: 'NORMAL',
            product_identifier: 'monthly_showseek_sub',
            purchase_date: '2026-02-24T00:00:00Z',
          },
        },
      },
      Date.parse('2026-02-24T00:00:00Z')
    );

    assert.equal(state.isPremium, true);
    assert.equal(state.entitlementType, 'subscription');
    assert.equal(state.subscriptionState, 'ACTIVE');
  });

  it('returns non-premium when entitlement is expired and no active subscription exists', () => {
    const state = resolveRevenueCatPremiumState(
      {
        entitlements: {
          premium: {
            expires_date: '2026-02-01T00:00:00Z',
            product_identifier: 'monthly_showseek_sub',
          },
        },
      },
      Date.parse('2026-02-24T00:00:00Z')
    );

    assert.equal(state.isPremium, false);
    assert.equal(state.entitlementType, 'none');
  });
});

describe('isTransientRevenueCatError', () => {
  it('flags retryable HTTP status codes as transient', () => {
    assert.equal(isTransientRevenueCatError(null, 429), true);
    assert.equal(isTransientRevenueCatError(null, 503), true);
  });

  it('flags network failures as transient', () => {
    assert.equal(
      isTransientRevenueCatError({
        code: 'ENOTFOUND',
      }),
      true
    );
  });
});
