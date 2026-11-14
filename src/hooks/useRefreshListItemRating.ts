import { useAuth } from '@/src/context/auth';
import { saveListRatings } from '@/src/services/ListRatingRefresh';
import type { UserList } from '@/src/services/ListService';
import {
  getListRatingTargets,
  getListRatingUpdate,
  getRatedMediaKey,
  rememberFreshRating,
  type RatedListMediaType,
} from '@/src/utils/listItemRatings';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/**
 * When a movie's or show's details page has its TMDB data, brings the rating saved on the
 * title's list entries up to date, once per screen. Lists keep the rating from when a title was
 * added, which drifts for new titles. Finding the saved copies costs nothing (the lists are
 * cached); only lists whose copy would show a different rating are written, and the cached
 * lists are updated so nothing is read again.
 */
export function useRefreshListItemRating({
  mediaType,
  mediaId,
  rating,
  lists,
}: {
  mediaType: RatedListMediaType;
  mediaId: number;
  /** TMDB's current `vote_average`; undefined until the details have loaded. */
  rating: number | undefined;
  lists: UserList[] | undefined;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const refreshedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !lists || typeof rating !== 'number' || !Number.isFinite(rating)) return;
    const mediaKey = getRatedMediaKey(mediaType, mediaId);
    if (refreshedKeyRef.current === mediaKey) return;
    refreshedKeyRef.current = mediaKey;

    // List checks this session can use this rating instead of looking the title up again.
    rememberFreshRating(mediaType, mediaId, rating);

    const saves = getListRatingTargets(lists, mediaType, mediaId).flatMap((target) =>
      getListRatingUpdate(target.storedRating, rating) === null ? [] : [{ target, rating }]
    );
    if (saves.length === 0) return;

    void saveListRatings(queryClient, userId, saves);
  }, [lists, mediaId, mediaType, queryClient, rating, userId]);
}
