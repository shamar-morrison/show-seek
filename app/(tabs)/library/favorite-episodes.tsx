import { EmptyState } from '@/src/components/library/EmptyState';
import { FavoriteEpisodeCard } from '@/src/components/library/FavoriteEpisodeCard';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { COLORS, HEADER_CHROME_HEIGHT, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useFavoriteEpisodes } from '@/src/hooks/useFavoriteEpisodes';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { usePreferences } from '@/src/hooks/usePreferences';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { Heart, Search } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FavoriteEpisodesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { t } = useTranslation();
  const { data: favoriteEpisodes, isLoading } = useFavoriteEpisodes();
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

  // Manage header manually - must reset header to undefined when closing search
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
      // Reset header to default and set custom headerRight
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
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

  const renderItem = useCallback(
    ({ item }: { item: FavoriteEpisode }) => (
      <FavoriteEpisodeCard episode={item} onPress={handleEpisodePress} />
    ),
    [handleEpisodePress]
  );

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!favoriteEpisodes || favoriteEpisodes.length === 0) {
    return (
      <View style={screenStyles.container}>
        <Stack.Screen options={{ title: t('library.favoriteEpisodes') }} />
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Heart}
          title={t('library.emptyFavoriteEpisodes')}
          description={t('library.emptyFavoriteEpisodesHint')}
        />
      </View>
    );
  }

  return (
    <View style={screenStyles.container}>
      <Stack.Screen options={{ title: t('library.favoriteEpisodes') }} />
      <View style={libraryListStyles.divider} />
      <FlashList
        data={displayEpisodes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={libraryListStyles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={ItemSeparator}
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
    </View>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: SPACING.m,
  },
});
