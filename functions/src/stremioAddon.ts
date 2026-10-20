import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { STREMIO_COMPLETION_THRESHOLD, STREMIO_MANIFEST } from './stremio/constants';
import { parseAddonRoute, type PlayerEvent } from './stremio/parsing';
import { resolveStremioTitle, StremioTmdbError } from './stremio/tmdb';
import {
  evictStremioToken,
  hasActiveAddonToken,
  hashAddonToken,
  issueAddonToken,
  lookupAddonUid,
  revokeAddonToken,
} from './stremio/tokens';
import { writeStremioWatch } from './stremio/watched';

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

function requireAccount(auth: { uid: string; token: Record<string, any> } | undefined): string {
  const provider = auth?.token?.firebase?.sign_in_provider ?? auth?.token?.sign_in_provider;
  if (!auth?.uid || provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Please sign in to continue.');
  }
  return auth.uid;
}

export const createStremioAddonToken = onCall({}, async (request) => {
  const uid = requireAccount(request.auth);
  const projectId = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
  return issueAddonToken(uid, projectId);
});

export const revokeStremioAddonToken = onCall({}, async (request) =>
  revokeAddonToken(requireAccount(request.auth))
);

function logEvent(event: PlayerEvent | null, outcome: string, details: Record<string, unknown> = {}): void {
  console.info('[StremioAddon]', {
    action: event?.action ?? null,
    type: event?.type ?? null,
    currentTime: event?.currentTime ?? null,
    duration: event?.duration ?? null,
    ratio: event && event.duration > 0 ? event.currentTime / event.duration : null,
    outcome,
    ...details,
  });
}

// The bearer token is in the route. Never log request URLs, raw requests, tokens or
// unsanitized errors here. Platform access logs may independently record these URLs.
export const stremioAddon = onRequest({ secrets: [TMDB_API_KEY] }, async (req, res): Promise<void> => {
  const receivedAt = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const route = parseAddonRoute(req.path);
  if (route.kind === 'bad_token') {
    logEvent(null, 'bad_token', { reason: 'invalid_format' });
    if (req.path.split('/')[2] === 'player') res.status(200).json({ success: true });
    else res.status(404).json({ error: 'Not Found' });
    return;
  }
  if (route.kind === 'not_found') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  const event = route.kind === 'player' ? route.event : null;
  if (route.kind === 'player') {
    if (!event) {
      logEvent(null, 'skipped_unmapped', { reason: 'malformed_event' });
      res.status(200).json({ success: true });
      return;
    }
    if (event.action !== 'stop') {
      logEvent(event, 'ignored_non_stop');
      res.status(200).json({ success: true });
      return;
    }
    if (event.duration === 0 || event.currentTime / event.duration < STREMIO_COMPLETION_THRESHOLD) {
      logEvent(event, 'skipped_below_threshold');
      res.status(200).json({ success: true });
      return;
    }
  }

  const hash = hashAddonToken(route.token);
  try {
    const uid = await lookupAddonUid(hash, route.kind !== 'manifest');
    // Preflight prevents revoked cached credentials from spending TMDB requests.
    // The writer checks this again inside its transaction to close the revoke race.
    const user = uid ? await admin.firestore().collection('users').doc(uid).get() : null;
    if (!uid || !user?.exists || !hasActiveAddonToken(user.data(), hash)) {
      evictStremioToken(hash);
      logEvent(event, 'bad_token');
      if (route.kind === 'manifest') res.status(404).json({ error: 'Not Found' });
      else res.status(200).json({ success: true });
      return;
    }
    if (route.kind === 'manifest') {
      res.status(200).json(STREMIO_MANIFEST);
      return;
    }

    const title = await resolveStremioTitle(event!, TMDB_API_KEY.value());
    if (!title) {
      logEvent(event, 'skipped_unmapped', { reason: 'no_matching_tmdb_title_or_episode' });
    } else {
      const result = await writeStremioWatch(uid, hash, title, receivedAt);
      if (result.outcome === 'bad_token') evictStremioToken(hash);
      logEvent(event, result.outcome, result.listOutcome ? { listOutcome: result.listOutcome } : {});
    }
    res.status(200).json({ success: true });
  } catch (error) {
    logEvent(event, 'error', error instanceof StremioTmdbError
      ? { reason: error.reason, statusCode: error.statusCode ?? null }
      : { reason: 'processing_failed' });
    // Stremio ignores event responses and has no reliable retry contract.
    if (route.kind === 'manifest') res.status(500).json({ error: 'Internal Server Error' });
    else res.status(200).json({ success: true });
  }
});
