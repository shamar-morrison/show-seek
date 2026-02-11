import { getOptimizedImageUrl, TVShow } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { usePreferences } from '@/src/hooks/usePreferences';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TVShowCardProps {
  show: TVShow;
  width?: number;
  /** Show badge if show is in any list (default: true) */
  showListBadge?: boolean;
}

export const TVShowCard = memo<TVShowCardProps>(({ show, width = 140, showListBadge = true }) => {
  const currentTab = useCurrentTab();
  const { getListsForMedia } = useListMembership();
  const { preferences } = usePreferences();

  const posterUrl = useMemo(
    () => getOptimizedImageUrl(show.poster_path, 'poster', 'medium', preferences?.dataSaver),
    [show.poster_path, preferences?.dataSaver]
  );
  const displayTitle = useMemo(
    () => getDisplayMediaTitle(show, !!preferences?.showOriginalTitles),
    [show, preferences?.showOriginalTitles]
  );

  const listIds = showListBadge ? getListsForMedia(show.id, 'tv') : [];
  const showBadge = listIds.length > 0;

  const handlePress = useCallback(() => {
    const path = currentTab ? `/(tabs)/${currentTab}/tv/${show.id}` : `/tv/${show.id}`;
    router.push(path as any);
  }, [currentTab, show.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, { width }]}
      activeOpacity={ACTIVE_OPACITY}
    >
      <View style={styles.posterContainer}>
        <MediaImage
          source={{ uri: posterUrl }}
          style={[styles.poster, { width, height: width * 1.5 }]}
          contentFit="cover"
        />
        {showBadge && <ListMembershipBadge listIds={listIds} />}
      </View>
      <View style={mediaCardStyles.info}>
        <Text style={mediaCardStyles.title} numberOfLines={2}>
          {displayTitle}
        </Text>
        {show.first_air_date && (
          <View style={mediaMetaStyles.yearRatingContainer}>
            <Text style={mediaMetaStyles.year}>{new Date(show.first_air_date).getFullYear()}</Text>
            {show.vote_average > 0 && (
              <>
                <Text style={mediaMetaStyles.separator}> • </Text>
                <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={mediaMetaStyles.rating}>{show.vote_average.toFixed(1)}</Text>
              </>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

TVShowCard.displayName = 'TVShowCard';

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.m,
  },
  posterContainer: {
    position: 'relative',
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
});
