/**
 * Trakt Context Constants
 */

export const ZIP_COOLDOWN_TICK_INTERVAL_MS = 15000;

// Maximum time to wait for the progress doc after a terminal user-doc
// snapshot before falling back to the failed view. Healthy-case latency is
// sub-second (both docs are written in one transaction); this is deliberately
// generous to avoid false triggers on slow networks, and the state
// self-corrects if the doc arrives later.
export const ZIP_HOLD_FOR_DOC_TIMEOUT_MS = 60000;
