import type {
  ListAction,
  ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import { COLORS } from '@/src/constants/theme';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import {
  useAddFavoritePerson,
  useFavoritePersons,
  useRemoveFavoritePerson,
} from '@/src/hooks/useFavoritePersons';
import type { FavoritePerson } from '@/src/types/favoritePerson';
import * as Haptics from 'expo-haptics';
import { FavouriteIcon, HeartRemoveIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PersonFavoriteTarget {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
}

export const toPersonFavoriteTarget = (person: {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for_department?: string | null;
}): PersonFavoriteTarget => ({
  id: person.id,
  name: person.name,
  profile_path: person.profile_path ?? null,
  known_for_department: person.known_for_department ?? '',
});

/**
 * Shared long-press favorite toggle for person cards.
 * Presents a bottom sheet (via ListActionsModal) with a single
 * add/remove favorite action. Render `<ListActionsModal ref={sheetRef} actions={actions} />`
 * alongside the calling screen.
 */
export const usePersonFavoriteSheet = () => {
  const { t } = useTranslation();
  const isAccountRequired = useAccountRequired();
  const { data: favoritePersons } = useFavoritePersons();
  const addFavoriteMutation = useAddFavoritePerson();
  const removeFavoriteMutation = useRemoveFavoritePerson();
  const sheetRef = useRef<ListActionsModalRef | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonFavoriteTarget | null>(null);

  const isSelectedFavorited = selectedPerson
    ? favoritePersons.some((person) => person.id === selectedPerson.id)
    : false;

  const handleToggleFavorite = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }

    try {
      if (isSelectedFavorited) {
        await removeFavoriteMutation.mutateAsync({ personId: selectedPerson.id });
      } else {
        const personData: Omit<FavoritePerson, 'addedAt'> = {
          id: selectedPerson.id,
          name: selectedPerson.name,
          profile_path: selectedPerson.profile_path,
          known_for_department: selectedPerson.known_for_department,
        };
        await addFavoriteMutation.mutateAsync({ personData });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[usePersonFavoriteSheet] Failed to toggle favorite person:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [addFavoriteMutation, isSelectedFavorited, removeFavoriteMutation, selectedPerson]);

  const actions = useMemo<ListAction[]>(() => {
    if (!selectedPerson) {
      return [];
    }

    return [
      {
        id: 'toggle-favorite-person',
        icon: isSelectedFavorited ? HeartRemoveIcon : FavouriteIcon,
        label: isSelectedFavorited
          ? t('person.removeFromFavoritePeople')
          : t('person.addToFavoritePeople'),
        color: isSelectedFavorited ? COLORS.error : undefined,
        onPress: () => {
          void handleToggleFavorite();
        },
      },
    ];
  }, [handleToggleFavorite, isSelectedFavorited, selectedPerson, t]);

  useEffect(() => {
    if (selectedPerson) {
      void sheetRef.current?.present();
    }
  }, [selectedPerson]);

  const handlePersonLongPress = useCallback(
    (person: PersonFavoriteTarget) => {
      if (isAccountRequired()) {
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedPerson(person);
    },
    [isAccountRequired]
  );

  return {
    sheetRef,
    actions,
    selectedPerson,
    handlePersonLongPress,
  };
};
