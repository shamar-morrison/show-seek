import { FavoriteEpisodeCard } from '@/src/components/library/FavoriteEpisodeCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import {
  COLORS,
  HEADER_CHROME_HEIGHT,
  SPACING,
} from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useFavoriteEpisodes } from '@/src/hooks/useFavoriteEpisodes';
import { useDeleteNote, useNotes } from '@/src/hooks/useNotes';
import { usePreferences } from '@/src/hooks/usePreferences';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { Note } from '@/src/types/note';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { Heart, Search } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FavoriteEpisodesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { t } = useTranslation();
  const { data: favoriteEpisodes, isLoading: isLoadingFavorites } = useFavoriteEpisodes();
  const { data: notes, isLoading: isLoadingNotes } = useNotes();
  const deleteNoteMutation = useDeleteNote();
  const noteSheetRef = useRef<NoteModalRef>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();

  const hideLabels = preferences?.hideTabLabels ?? false;
  const TAB_BAR_HEIGHT = hideLabels ? 56 : 70;

  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayEpisodes,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: favoriteEpisodes || [],
    getSearchableText: (ep) => `${ep.episodeName} ${ep.showName}`,
  });

  useLayoutEffect(() => {
    if (isSearchActive) {
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchEpisodesPlaceholder'),
        })
      );
    } else {
      navigation.setOptions({
        headerRight: () => (
          <HeaderIconButton onPress={searchButton.onPress}>
            <Search size={22} color={COLORS.text} />
          </HeaderIconButton>
        ),
      });
    }
  }, [navigation, isSearchActive, searchQuery, setSearchQuery, deactivateSearch, searchButton, t]);

  const handleEpisodePress = useCallback(
    (episode: FavoriteEpisode) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!currentTab) return;
      
      const path = `/(tabs)/${currentTab}/tv/${episode.tvShowId}/season/${episode.seasonNumber}/episode/${episode.episodeNumber}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const handleEditNote = useCallback((note: Note) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noteSheetRef.current?.present({
      mediaType: 'episode',
      mediaId: note.mediaId,
      seasonNumber: note.seasonNumber,
      episodeNumber: note.episodeNumber,
      posterPath: note.posterPath,
      mediaTitle: note.mediaTitle,
      initialNote: note.content,
      showId: note.showId,
    });
  }, []);

  const handleDeleteNote = useCallback(
    async (note: Note) => {
      Alert.alert(t('notes.deleteNote'), t('notes.confirmDeleteNote'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoteMutation.mutateAsync({
                mediaType: 'episode',
                mediaId: note.mediaId,
                seasonNumber: note.seasonNumber,
                episodeNumber: note.episodeNumber,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert(t('common.error'), t('errors.deleteFailed'));
            }
          },
        },
      ]);
    },
    [deleteNoteMutation, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: FavoriteEpisode }) => {
      const episodeNote = notes?.find(
        (n) =>
          n.mediaType === 'episode' &&
          n.mediaId === item.tvShowId &&
          n.seasonNumber === item.seasonNumber &&
          n.episodeNumber === item.episodeNumber
      );

      return (
        <FavoriteEpisodeCard
          episode={item}
          note={episodeNote || null}
          onPress={handleEpisodePress}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
        />
      );
    },
    [notes, handleEpisodePress, handleEditNote, handleDeleteNote]
  );

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (isLoadingFavorites || isLoadingNotes) {
    return <FullScreenLoading />;
  }

  if (!favoriteEpisodes || favoriteEpisodes.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: t('library.favoriteEpisodes') }} />
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Heart}
          title={t('library.emptyFavoriteEpisodes')}
          description={t('library.emptyFavoriteEpisodesHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t('library.favoriteEpisodes') }} />
      <View style={libraryListStyles.divider} />
      <FlashList
        data={displayEpisodes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={libraryListStyles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={ItemSeparator}
        estimatedItemSize={120}
        ListEmptyComponent={
          searchQuery ? (
            <SearchEmptyState
              height={
                windowHeight - insets.top - insets.bottom - HEADER_CHROME_HEIGHT - TAB_BAR_HEIGHT
              }
            />
          ) : null
        }
      />
      <NoteModal ref={noteSheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: SPACING.m,
  },
});
