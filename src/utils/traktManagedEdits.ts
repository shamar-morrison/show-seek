const warnedManagedEditKinds = new Set<'list' | 'rating' | 'watched'>();

export const isTraktManagedListId = (listId?: string | null): boolean =>
  Boolean(
    listId &&
      (listId === 'already-watched' ||
        listId === 'favorites' ||
        listId === 'watchlist' ||
        listId.startsWith('trakt_'))
  );

const warnOnce = (
  kind: 'list' | 'rating' | 'watched',
  showToast: ((message: string) => void) | undefined,
  message: string
) => {
  if (warnedManagedEditKinds.has(kind)) {
    return;
  }

  if (!showToast) {
    return;
  }

  warnedManagedEditKinds.add(kind);
  showToast(message);
};

export const maybeWarnTraktManagedListEdit = (
  isTraktConnected: boolean,
  listIds: Array<string | undefined | null>,
  showToast: ((message: string) => void) | undefined,
  message: string
) => {
  if (!isTraktConnected || !listIds.some((listId) => isTraktManagedListId(listId))) {
    return;
  }

  warnOnce('list', showToast, message);
};

export const maybeWarnTraktManagedRatingEdit = (
  isTraktConnected: boolean,
  showToast: ((message: string) => void) | undefined,
  message: string
) => {
  if (!isTraktConnected) {
    return;
  }

  warnOnce('rating', showToast, message);
};

export const maybeWarnTraktManagedWatchedEdit = (
  isTraktConnected: boolean,
  showToast: ((message: string) => void) | undefined,
  message: string
) => {
  if (!isTraktConnected) {
    return;
  }

  warnOnce('watched', showToast, message);
};
