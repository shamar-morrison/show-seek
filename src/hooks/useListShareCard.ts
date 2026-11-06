import type { ListAction } from '@/src/components/ListActionsModal';
import type { ListShareCardData } from '@/src/components/shareCard/shareCardTypes';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import type { ListMediaItem } from '@/src/services/ListService';
import { Image01Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FAN_POSTER_COUNT = 3;

/**
 * Share card support for a list screen, showing the items in the order the screen shows them.
 * `items` is whatever the screen currently displays, so filters and sorting carry over.
 */
export function useListShareCard(listName: string, items: ListMediaItem[]) {
  const { t } = useTranslation();
  const { resolvePosterPath } = usePosterOverrides();
  const [isOpen, setIsOpen] = useState(false);

  const shareCardAction = useMemo<ListAction>(
    () => ({
      id: 'share-card',
      icon: Image01Icon,
      label: t('shareCard.title'),
      onPress: () => setIsOpen(true),
      disabled: items.length === 0,
    }),
    [items.length, t]
  );

  const shareCard: ListShareCardData | null = isOpen
    ? {
        kind: 'list',
        listName,
        itemCount: items.length,
        posterPaths: items
          .map((item) => resolvePosterPath(item.media_type, item.id, item.poster_path))
          .filter((path): path is string => !!path)
          .slice(0, FAN_POSTER_COUNT),
      }
    : null;

  return { shareCardAction, shareCard, closeShareCard: () => setIsOpen(false) };
}
