import type { ListAction } from '@/src/components/ListActionsModal';
import { useOpenShareCard } from '@/src/hooks/useOpenShareCard';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import type { ListMediaItem } from '@/src/services/ListService';
import { Image01Icon } from '@hugeicons/core-free-icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const FAN_POSTER_COUNT = 3;

/**
 * The action that shares a list as a card, showing the items in the order the screen shows them.
 * `items` is whatever the screen currently displays, so filters and sorting carry over.
 */
export function useListShareCardAction(listName: string, items: ListMediaItem[]) {
  const { t } = useTranslation();
  const { resolvePosterPath } = usePosterOverrides();
  const openShareCard = useOpenShareCard();

  return useMemo<ListAction>(
    () => ({
      id: 'share-card',
      icon: Image01Icon,
      label: t('shareCard.title'),
      onPress: () =>
        openShareCard([
          {
            kind: 'list',
            listName,
            itemCount: items.length,
            // Different items can share a custom poster, and the fan should show distinct ones.
            posterPaths: [
              ...new Set(
                items
                  .map((item) => resolvePosterPath(item.media_type, item.id, item.poster_path))
                  .filter((path): path is string => !!path)
              ),
            ].slice(0, FAN_POSTER_COUNT),
          },
        ]),
      disabled: items.length === 0,
    }),
    [items, listName, openShareCard, resolvePosterPath, t]
  );
}
