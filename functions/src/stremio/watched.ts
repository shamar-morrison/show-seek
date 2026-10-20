import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildListItemKey, getLegacyListItemKey, hasExistingListItem } from '../shared/listItemKeys';
import { STREMIO_MAX_FREE_LIST_ITEMS } from './constants';
import type { MappedTitle } from './tmdb';
import { hasActiveAddonToken } from './tokens';

export interface WatchWriteResult {
  outcome: 'written' | 'skipped_duplicate' | 'bad_token';
  listOutcome?: 'added' | 'already_present' | 'skipped_limit';
}

export const buildStremioWatchId = (movieId: number, receivedAt: number): string =>
  `stremio-${movieId}-${new Date(receivedAt).toISOString().slice(0, 10).replace(/-/g, '')}`;

const asMap = (value: unknown): Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const preferenceEnabled = (data: FirebaseFirestore.DocumentData, key: string): boolean =>
  typeof data.preferences?.[key] === 'boolean' ? data.preferences[key] : true;

function addListItem(
  transaction: FirebaseFirestore.Transaction,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  name: string,
  item: Record<string, unknown> & { id: number; media_type: 'movie' | 'tv' },
  isPremium: boolean,
  receivedAt: number
): NonNullable<WatchWriteResult['listOutcome']> {
  const data = snapshot.data() ?? {};
  const items = asMap(data.items);
  if (hasExistingListItem(items, item.media_type, item.id)) return 'already_present';
  // Count a legacy + canonical duplicate once, as the mobile list normalization does.
  const keys = new Set(Object.entries(items).map(([key, value]) =>
    (value?.media_type === 'movie' || value?.media_type === 'tv') && typeof value.id === 'number'
      ? buildListItemKey(value.media_type, value.id) : key
  ));
  if (!isPremium && keys.size >= STREMIO_MAX_FREE_LIST_ITEMS) return 'skipped_limit';

  const itemKey = buildListItemKey(item.media_type, item.id);
  if (snapshot.exists) {
    transaction.update(snapshot.ref, {
      [`items.${itemKey}`]: { ...item, addedAt: receivedAt },
      [`items.${getLegacyListItemKey(item.id)}`]: FieldValue.delete(),
      updatedAt: receivedAt,
      name,
    });
  } else {
    transaction.set(snapshot.ref, {
      name,
      items: { [itemKey]: { ...item, addedAt: receivedAt } },
      createdAt: receivedAt,
      updatedAt: receivedAt,
    }, { merge: true });
  }
  return 'added';
}

export async function writeStremioWatch(
  uid: string,
  tokenHash: string,
  title: MappedTitle,
  receivedAt: number
): Promise<WatchWriteResult> {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction): Promise<WatchWriteResult> => {
    const user = await transaction.get(userRef);
    if (!user.exists || !hasActiveAddonToken(user.data(), tokenHash)) return { outcome: 'bad_token' };
    const userData = user.data()!;
    const isPremium = userData.premium?.isPremium === true;
    const lists = userRef.collection('lists');

    if (title.kind === 'movie') {
      const movie = title.movie;
      const watches = userRef.collection('watched_movies').doc(String(movie.id)).collection('watches');
      const watchRef = watches.doc(buildStremioWatchId(movie.id, receivedAt));
      if ((await transaction.get(watchRef)).exists) return { outcome: 'skipped_duplicate' };

      const autoAdd = preferenceEnabled(userData, 'autoAddToAlreadyWatched');
      const hasPreviousWatch = autoAdd ? !(await transaction.get(watches.limit(1))).empty : true;
      const alreadyWatched = autoAdd && !hasPreviousWatch
        ? await transaction.get(lists.doc('already-watched')) : null;
      const watchlist = preferenceEnabled(userData, 'autoRemoveFromShouldWatch')
        ? await transaction.get(lists.doc('watchlist')) : null;

      // All reads precede writes. A transaction retry sees concurrent watches/revocation.
      transaction.create(watchRef, { movieId: movie.id, watchedAt: Timestamp.fromMillis(receivedAt) });
      let listOutcome: WatchWriteResult['listOutcome'];
      if (alreadyWatched) {
        listOutcome = addListItem(transaction, alreadyWatched, 'Already Watched', {
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          media_type: 'movie',
          vote_average: movie.vote_average,
          release_date: movie.release_date,
          genre_ids: movie.genres.map((genre) => genre.id),
          ...(movie.runtime !== null && movie.runtime > 0 ? { runtimeMinutes: movie.runtime } : {}),
        }, isPremium, receivedAt);
      }
      if (watchlist?.exists && hasExistingListItem(asMap(watchlist.data()?.items), 'movie', movie.id)) {
        transaction.update(watchlist.ref, {
          [`items.${buildListItemKey('movie', movie.id)}`]: FieldValue.delete(),
          [`items.${getLegacyListItemKey(movie.id)}`]: FieldValue.delete(),
          updatedAt: receivedAt,
        });
      }
      return { outcome: 'written', ...(listOutcome ? { listOutcome } : {}) };
    }

    const { show, episode } = title;
    const trackingRef = userRef.collection('episode_tracking').doc(String(show.id));
    const tracking = await transaction.get(trackingRef);
    const episodeKey = `${episode.season_number}_${episode.episode_number}`;
    if (Object.prototype.hasOwnProperty.call(asMap(tracking.data()?.episodes), episodeKey)) {
      return { outcome: 'skipped_duplicate' };
    }
    const watching = preferenceEnabled(userData, 'autoAddToWatching')
      ? await transaction.get(lists.doc('currently-watching')) : null;

    transaction.set(trackingRef, {
      episodes: {
        [episodeKey]: {
          episodeId: episode.id,
          tvShowId: show.id,
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_number,
          watchedAt: receivedAt,
          episodeName: episode.name,
          episodeAirDate: episode.air_date,
          ...(episode.runtime !== null && episode.runtime > 0 ? { runtimeMinutes: episode.runtime } : {}),
        },
      },
      metadata: { tvShowName: show.name, posterPath: show.poster_path, lastUpdated: receivedAt },
    }, { merge: true });
    const listOutcome = watching ? addListItem(transaction, watching, 'Watching', {
      id: show.id,
      title: show.name,
      name: show.name,
      poster_path: show.poster_path,
      media_type: 'tv',
      vote_average: show.vote_average,
      release_date: show.first_air_date,
      first_air_date: show.first_air_date,
      genre_ids: show.genres.map((genre) => genre.id),
    }, isPremium, receivedAt) : undefined;
    return { outcome: 'written', ...(listOutcome ? { listOutcome } : {}) };
  });
}
