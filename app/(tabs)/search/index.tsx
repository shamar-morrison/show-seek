import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { FavoritePersonBadge } from '@/src/components/ui/FavoritePersonBadge';
import { InlineListIndicators } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useListMembership } from '@/src/hooks/useListMembership';
import { usePreferences } from '@/src/hooks/usePreferences';
import { ListMediaItem } from '@/src/services/ListService';
import { metaTextStyles } from '@/src/styles/metaTextStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useSegments } from 'expo-router';
import { Search as SearchIcon, Star, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MediaType = 'all' | 'movie' | 'tv';

function resolveSearchResultMediaType(
  item: any,
  selectedMediaType: MediaType
): 'person' | 'movie' | 'tv' | null {
  if (item.media_type === 'person') return 'person';
  if (item.media_type === 'movie') return 'movie';
  if (item.media_type === 'tv') return 'tv';

  if (selectedMediaType === 'movie') return 'movie';
  if (selectedMediaType === 'tv') return 'tv';

  if ('first_air_date' in item && !('release_date' in item)) return 'tv';
  if ('release_date' in item && !('first_air_date' in item)) return 'movie';
  if ('name' in item && !('title' in item)) return 'tv';
  if ('title' in item) return 'movie';

  return null;
}

export default function SearchScreen() {
  const segments = useSegments();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const isAccountRequired = useAccountRequired();
  const { preferences } = usePreferences();

  const genresQuery = useAllGenres();
  const genreMap = genresQuery.data || {};
  const { getListsForMedia, showIndicators } = useListMembership();
  const { data: favoritePersons } = useFavoritePersons();

  // Long-press to add to list
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResultsQuery = useQuery({
    queryKey: ['search', debouncedQuery, mediaType],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return { results: [] };

      switch (mediaType) {
        case 'movie':
          return await tmdbApi.searchMovies(debouncedQuery);
        case 'tv':
          return await tmdbApi.searchTV(debouncedQuery);
        default:
          return await tmdbApi.searchMulti(debouncedQuery);
      }
    },
    enabled: debouncedQuery.length > 0,
  });

  // Filter out watched content (but keep person results)
  const allResults = searchResultsQuery.data?.results || [];
  const mediaResults = allResults.filter((item: any) => item.media_type !== 'person');
  const personResults = allResults.filter((item: any) => item.media_type === 'person');
  const filteredMediaResults = useContentFilter(mediaResults);
  const filteredResults = [...personResults, ...filteredMediaResults];

  const handleItemPress = (item: any) => {
    const currentTab = segments[1];
    const basePath = currentTab ? `/(tabs)/${currentTab}` : '';
    const resolvedMediaType = resolveSearchResultMediaType(item, mediaType);

    if (resolvedMediaType === 'person') {
      router.push(`${basePath}/person/${item.id}` as any);
    } else if (resolvedMediaType === 'movie') {
      router.push(`${basePath}/movie/${item.id}` as any);
    } else if (resolvedMediaType === 'tv') {
      router.push(`${basePath}/tv/${item.id}` as any);
    }
  };

  const handleLongPress = (item: any) => {
    if (isAccountRequired()) return;

    // Skip for person results
    if (item.media_type === 'person') return;

    const itemMediaType = resolveSearchResultMediaType(item, mediaType);
    if (itemMediaType !== 'movie' && itemMediaType !== 'tv') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const title = item.title || item.name || '';
    const releaseDate = item.release_date || item.first_air_date || '';
    setSelectedMediaItem({
      id: item.id,
      media_type: itemMediaType,
      title: title,
      name: item.name,
      poster_path: item.poster_path,
      vote_average: item.vote_average || 0,
      release_date: releaseDate,
      first_air_date: item.first_air_date,
    });
    // Note: Modal is presented via useEffect below to ensure it's mounted first
  };

  // Present the modal when an item is selected
  // This uses useEffect to ensure the modal is mounted (if conditionally rendered)
  // before we try to present it
  useEffect(() => {
    if (selectedMediaItem) {
      addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const handleShowToast = (message: string) => {
    toastRef.current?.show(message);
  };

  const renderMediaItem = ({ item }: { item: any }) => {
    const isPerson = item.media_type === 'person';
    const displayTitle = isPerson
      ? item.name || item.title || ''
      : getDisplayMediaTitle(item, !!preferences?.showOriginalTitles);
    const releaseDate = item.release_date || item.first_air_date;
    const posterUrl = getImageUrl(
      item.poster_path || item.profile_path,
      TMDB_IMAGE_SIZES.poster.small
    );

    // Get genre names from genre_ids
    const genres = item.genre_ids
      ? item.genre_ids
          .slice(0, 3)
          .map((id: number) => genreMap[id])
          .filter(Boolean)
      : [];

    // Determine media type for list check (default to filter type if not multi-search)
    const itemMediaType = item.media_type || (mediaType !== 'all' ? mediaType : 'movie');
    const listIds = !isPerson && showIndicators ? getListsForMedia(item.id, itemMediaType) : [];

    // Check if person is favorited
    const isPersonFavorited = isPerson && favoritePersons?.some((p) => p.id === item.id);

    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <View style={styles.posterContainer}>
          <MediaImage source={{ uri: posterUrl }} style={styles.resultPoster} contentFit="cover" />
          {isPersonFavorited && <FavoritePersonBadge />}
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          {isPerson && item.known_for_department && (
            <Text style={[styles.department, { color: accentColor }]}>
              {item.known_for_department}
            </Text>
          )}
          {!isPerson && (
            <>
              <View style={styles.metaRow}>
                {releaseDate && (
                  <Text style={metaTextStyles.secondary}>
                    {new Date(releaseDate).getFullYear()}
                  </Text>
                )}
                {item.vote_average > 0 && releaseDate && (
                  <Text style={metaTextStyles.secondary}> • </Text>
                )}
                {item.vote_average > 0 && (
                  <View style={styles.ratingContainer}>
                    <Star size={14} fill={COLORS.warning} color={COLORS.warning} />
                    <Text style={styles.rating}>{item.vote_average.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              {genres.length > 0 && (
                <Text style={styles.genres} numberOfLines={1}>
                  {genres.join(' • ')}
                </Text>
              )}
            </>
          )}
          {isPerson && item.known_for && item.known_for.length > 0 && (
            <Text style={styles.knownFor} numberOfLines={2}>
              {t('person.knownForLabel')}{' '}
              {item.known_for
                .slice(0, 3)
                .map((work: any) => work.title || work.name)
                .join(', ')}
            </Text>
          )}
          {!isPerson && item.overview && (
            <Text style={styles.resultOverview} numberOfLines={3}>
              {item.overview}
            </Text>
          )}
          {listIds.length > 0 && <InlineListIndicators listIds={listIds} size="medium" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('tabs.search')}</Text>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <SearchIcon size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('search.placeholder')}
              placeholderTextColor={COLORS.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={HIT_SLOP.l}
                activeOpacity={ACTIVE_OPACITY}
              >
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.typeToggleContainer}>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'all' && { backgroundColor: accentColor }]}
            onPress={() => setMediaType('all')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'all' && styles.typeTextActive]}>
              {t('search.all')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'movie' && { backgroundColor: accentColor }]}
            onPress={() => setMediaType('movie')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'movie' && styles.typeTextActive]}>
              {t('media.movies')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'tv' && { backgroundColor: accentColor }]}
            onPress={() => setMediaType('tv')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'tv' && styles.typeTextActive]}>
              {t('media.tvShows')}
            </Text>
          </TouchableOpacity>
        </View>

        {searchResultsQuery.isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        ) : debouncedQuery.length === 0 ? (
          <View style={styles.centerContainer}>
            <SearchIcon size={64} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>{t('search.prompt')}</Text>
          </View>
        ) : filteredResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
            <Text style={styles.emptySubtext}>{t('search.adjustSearch')}</Text>
          </View>
        ) : (
          <FlashList
            data={filteredResults}
            renderItem={renderMediaItem}
            keyExtractor={(item: any) => `${item.media_type || mediaType}-${item.id}`}
            contentContainerStyle={[styles.listContainer]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            drawDistance={400}
          />
        )}
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}
      <Toast ref={toastRef} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchContainer: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.m,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    padding: SPACING.m,
    gap: SPACING.s,
  },
  typeButton: {
    flex: 1,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  typeText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  typeTextActive: {
    color: COLORS.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
  },
  emptySubtext: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
  },
  listContainer: {
    paddingHorizontal: SPACING.l,
  },
  resultItem: {
    flexDirection: 'row',
    marginBottom: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
  },
  posterContainer: {
    position: 'relative',
  },
  resultPoster: {
    width: 92,
    height: 138,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  resultInfo: {
    flex: 1,
    marginLeft: SPACING.m,
  },
  resultTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  department: {
    fontSize: FONT_SIZE.s,
    marginTop: 2,
  },
  knownFor: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
    lineHeight: 18,
  },
  resultOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
    lineHeight: 18,
  },
  genres: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});
