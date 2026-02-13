import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { EXCLUDED_TV_GENRE_IDS } from '@/src/constants/genres';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import {
  useAddFavoritePerson,
  useIsPersonFavorited,
  useRemoveFavoritePerson,
} from '@/src/hooks/useFavoritePersons';
import { usePreferences } from '@/src/hooks/usePreferences';
import { errorStyles } from '@/src/styles/errorStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Facebook,
  Heart,
  Instagram,
  MapPin,
  Music2,
  Star,
  Twitter,
  Youtube,
} from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SocialLink = {
  key: 'instagram' | 'twitter' | 'facebook' | 'tiktok' | 'youtube';
  label: string;
  url: string;
  icon: React.ReactNode;
};

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const currentTab = useCurrentTab();
  const { accentColor } = useAccentColor();
  const personId = Number(id);
  const [refreshing, setRefreshing] = useState(false);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { preferences } = usePreferences();
  const { isFavorited, isLoading: isFavoritedLoading } = useIsPersonFavorited(personId);
  const addFavoriteMutation = useAddFavoritePerson();
  const removeFavoriteMutation = useRemoveFavoritePerson();
  const isLoadingFavorite =
    isFavoritedLoading || addFavoriteMutation.isPending || removeFavoriteMutation.isPending;

  const personQuery = useQuery({
    queryKey: ['person', personId],
    queryFn: () => tmdbApi.getPersonDetails(personId),
    enabled: !!personId,
  });

  const movieCreditsQuery = useQuery({
    queryKey: ['person', personId, 'movie-credits'],
    queryFn: () => tmdbApi.getPersonMovieCredits(personId),
    enabled: !!personId,
  });

  const tvCreditsQuery = useQuery({
    queryKey: ['person', personId, 'tv-credits'],
    queryFn: () => tmdbApi.getPersonTVCredits(personId),
    enabled: !!personId,
  });

  const navigateTo = useCallback(
    (path: string) => {
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}${path}` as any);
      } else {
        router.push(path as any);
      }
    },
    [currentTab, router]
  );

  if (personQuery.isLoading) {
    return <FullScreenLoading />;
  }

  if (personQuery.isError || !personQuery.data) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.text}>{t('person.failedToLoadDetails')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.backButtonText, { color: accentColor }]}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const person = personQuery.data;

  const isCrewRole =
    person.known_for_department === 'Directing' || person.known_for_department === 'Writing';

  // For directors/writers, show their crew credits (directed, written, created)
  // For actors, show their cast credits
  const relevantCrewJobs = [
    'Director',
    'Writer',
    'Screenplay',
    'Story',
    'Creator',
    'Executive Producer',
  ];

  // Filter and deduplicate crew credits (a person may have multiple roles on same project)
  const getUniqueCredits = <T extends { id: number }>(credits: T[]): T[] => {
    const uniqueMap = new Map<number, T>();
    credits.forEach((credit) => {
      if (!uniqueMap.has(credit.id)) {
        uniqueMap.set(credit.id, credit);
      }
    });
    return Array.from(uniqueMap.values());
  };

  const movieCredits = isCrewRole
    ? getUniqueCredits(
        (movieCreditsQuery.data?.crew || []).filter((credit) =>
          relevantCrewJobs.some((job) => credit.job?.includes(job))
        )
      )
    : movieCreditsQuery.data?.cast || [];

  const tvCredits = isCrewRole
    ? getUniqueCredits(
        (tvCreditsQuery.data?.crew || []).filter((credit) =>
          relevantCrewJobs.some((job) => credit.job?.includes(job))
        )
      )
    : getUniqueCredits(tvCreditsQuery.data?.cast || []);

  // Filter out non-scripted shows from TV credits
  const filteredTVCredits = tvCredits.filter(
    (show) => !show.genre_ids?.some((genreId) => EXCLUDED_TV_GENRE_IDS.includes(genreId))
  );

  // Sort by popularity and get top items
  const knownForMovies = [...movieCredits].sort((a, b) => b.popularity - a.popularity).slice(0, 10);

  const knownForTV = [...filteredTVCredits]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 10);

  const profileUrl = getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.large);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.unknown');
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const calculateAge = (birthday: string | null, deathday: string | null) => {
    if (!birthday) return null;
    const birth = new Date(birthday);
    const end = deathday ? new Date(deathday) : new Date();
    const age = end.getFullYear() - birth.getFullYear();
    return age;
  };

  const handleMoviePress = (id: number) => {
    navigateTo(`/movie/${id}`);
  };

  const handleTVPress = (id: number) => {
    navigateTo(`/tv/${id}`);
  };

  const handleViewAllMovies = () => {
    navigateTo(
      `/person/${personId}/credits?name=${encodeURIComponent(person.name)}&mediaType=movie&creditType=${isCrewRole ? 'crew' : 'cast'}`
    );
  };

  const handleViewAllTV = () => {
    navigateTo(
      `/person/${personId}/credits?name=${encodeURIComponent(person.name)}&mediaType=tv&creditType=${isCrewRole ? 'crew' : 'cast'}`
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        personQuery.refetch(),
        movieCreditsQuery.refetch(),
        tvCreditsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleFavoriteToggle = () => {
    if (isLoadingFavorite) return;

    (async () => {
      try {
        if (isFavorited) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await removeFavoriteMutation.mutateAsync({ personId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await addFavoriteMutation.mutateAsync({
            personData: {
              id: personId,
              name: person.name,
              profile_path: person.profile_path,
              known_for_department: person.known_for_department,
            },
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    })();
  };

  const age = calculateAge(person.birthday, person.deathday);
  const getTrimmedExternalId = (id: string | null | undefined) => {
    const trimmed = id?.trim();
    return trimmed ? trimmed : null;
  };

  const instagramId = getTrimmedExternalId(person.external_ids?.instagram_id);
  const twitterId = getTrimmedExternalId(person.external_ids?.twitter_id);
  const facebookId = getTrimmedExternalId(person.external_ids?.facebook_id);
  const youtubeId = getTrimmedExternalId(person.external_ids?.youtube_id);
  const tiktokId = (() => {
    const id = getTrimmedExternalId(person.external_ids?.tiktok_id);
    if (!id) return null;
    const normalized = id.replace(/^@+/, '');
    return normalized || null;
  })();

  const socialLinks: SocialLink[] = (
    [
      instagramId
        ? {
            key: 'instagram',
            label: t('media.instagram'),
            url: `https://www.instagram.com/${instagramId}`,
            icon: <Instagram size={20} color={COLORS.text} />,
          }
        : null,
      twitterId
        ? {
            key: 'twitter',
            label: t('media.twitter'),
            url: `https://twitter.com/${twitterId}`,
            icon: <Twitter size={20} color={COLORS.text} />,
          }
        : null,
      facebookId
        ? {
            key: 'facebook',
            label: t('media.facebook'),
            url: `https://www.facebook.com/${facebookId}`,
            icon: <Facebook size={20} color={COLORS.text} />,
          }
        : null,
      tiktokId
        ? {
            key: 'tiktok',
            label: t('media.tiktok'),
            url: `https://www.tiktok.com/@${tiktokId}`,
            icon: <Music2 size={20} color={COLORS.text} />,
          }
        : null,
      youtubeId
        ? {
            key: 'youtube',
            label: t('media.youtube'),
            url: `https://www.youtube.com/${youtubeId}`,
            icon: <Youtube size={20} color={COLORS.text} />,
          }
        : null,
    ] as (SocialLink | null)[]
  ).filter((link): link is SocialLink => Boolean(link));

  const handleSocialPress = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Failed to open social link:', error);
    }
  };

  return (
    <View style={screenStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={person.name}
        subtitle={person.known_for_department}
        onBackPress={() => router.back()}
        scrollY={scrollY}
      />

      <Animated.ScrollView
        {...scrollViewProps}
        style={styles.scrollView}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >
        <SafeAreaView edges={['top']}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          <MediaImage
            source={{ uri: profileUrl }}
            style={styles.profileImage}
            contentFit="cover"
            placeholderType="person"
          />

          {socialLinks.length > 0 && (
            <View style={styles.socialRow}>
              {socialLinks.map((socialLink) => (
                <TouchableOpacity
                  key={socialLink.key}
                  style={styles.socialButton}
                  onPress={() => void handleSocialPress(socialLink.url)}
                  activeOpacity={ACTIVE_OPACITY}
                  accessibilityRole="link"
                  accessibilityLabel={socialLink.label}
                >
                  {socialLink.icon}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.profileInfo}>
            <Text style={styles.name}>{person.name}</Text>

            {person.known_for_department && (
              <Text style={[styles.department, { color: accentColor }]}>
                {person.known_for_department}
              </Text>
            )}

            <View style={styles.detailsContainer}>
              {person.birthday && (
                <View style={styles.detailItem}>
                  <Calendar size={14} color={COLORS.textSecondary} />
                  <Text style={styles.detailText}>
                    {formatDate(person.birthday)}
                    {age !== null &&
                      ` ${t(person.deathday ? 'person.ageAtDeath' : 'person.ageYearsOld', {
                        count: age,
                      })}`}
                  </Text>
                </View>
              )}

              {person.place_of_birth && (
                <View style={styles.detailItem}>
                  <MapPin size={14} color={COLORS.textSecondary} />
                  <Text style={styles.detailText}>{person.place_of_birth}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Action Row */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.favoriteButton,
              { backgroundColor: accentColor },
              isFavorited && [styles.favoritedButton, { borderColor: accentColor }],
            ]}
            onPress={handleFavoriteToggle}
            disabled={isLoadingFavorite}
            activeOpacity={ACTIVE_OPACITY}
          >
            {isLoadingFavorite ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Heart
                  size={24}
                  color={COLORS.white}
                  fill={isFavorited ? COLORS.white : 'transparent'}
                />
                <Text style={styles.favoriteButtonText}>
                  {isFavorited
                    ? t('person.removeFromFavoritePeople')
                    : t('person.addToFavoritePeople')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Biography */}
        {person.biography && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('person.biography')}</Text>
            <ExpandableText
              text={person.biography}
              style={[styles.biography, { marginBottom: SPACING.s }]}
              readMoreStyle={[styles.readMore, { color: accentColor }]}
            />
          </View>
        )}

        {/* Known For - Movies */}
        {knownForMovies.length > 0 && (
          <View style={styles.section}>
            {movieCredits.length > 10 ? (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={handleViewAllMovies}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.sectionTitle}>
                  {isCrewRole ? t('person.directedWrittenMovies') : t('person.knownForMovies')}
                </Text>
                <ArrowRight size={23} color={accentColor} style={styles.viewAll} />
              </TouchableOpacity>
            ) : (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {isCrewRole ? t('person.directedWrittenMovies') : t('person.knownForMovies')}
                </Text>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {knownForMovies.map((movie, index) => (
                <TouchableOpacity
                  key={`movie-${movie.id}-${index}`}
                  style={styles.creditCard}
                  onPress={() => handleMoviePress(movie.id)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <MediaImage
                    source={{
                      uri: getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.small),
                    }}
                    style={styles.creditPoster}
                    contentFit="cover"
                  />
                  <Text style={styles.creditTitle} numberOfLines={2}>
                    {getDisplayMediaTitle(movie, !!preferences?.showOriginalTitles)}
                  </Text>
                  <View style={styles.creditMeta}>
                    {movie.release_date && (
                      <Text style={styles.creditYear}>
                        {new Date(movie.release_date).getFullYear()}
                      </Text>
                    )}
                    {movie.vote_average > 0 && (
                      <>
                        {movie.release_date && <Text style={styles.creditYear}> • </Text>}
                        <View style={styles.creditRating}>
                          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                          <Text style={styles.creditRatingText}>
                            {movie.vote_average.toFixed(1)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Known For - TV Shows */}
        {knownForTV.length > 0 && (
          <View style={styles.section}>
            {filteredTVCredits.length > 10 ? (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={handleViewAllTV}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.sectionTitle}>
                  {isCrewRole ? t('person.directedWrittenTV') : t('person.knownForTV')}
                </Text>
                <ArrowRight size={23} color={accentColor} style={styles.viewAll} />
              </TouchableOpacity>
            ) : (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {isCrewRole ? t('person.directedWrittenTV') : t('person.knownForTV')}
                </Text>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {knownForTV.map((show, index) => (
                <TouchableOpacity
                  key={`tv-${show.id}-${index}`}
                  style={styles.creditCard}
                  onPress={() => handleTVPress(show.id)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <MediaImage
                    source={{
                      uri: getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.small),
                    }}
                    style={styles.creditPoster}
                    contentFit="cover"
                  />
                  <Text style={styles.creditTitle} numberOfLines={2}>
                    {getDisplayMediaTitle(show, !!preferences?.showOriginalTitles)}
                  </Text>
                  <View style={styles.creditMeta}>
                    {show.first_air_date && (
                      <Text style={styles.creditYear}>
                        {new Date(show.first_air_date).getFullYear()}
                      </Text>
                    )}
                    {show.vote_average > 0 && (
                      <>
                        {show.first_air_date && <Text style={styles.creditYear}> • </Text>}
                        <View style={styles.creditRating}>
                          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                          <Text style={styles.creditRatingText}>
                            {show.vote_average.toFixed(1)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: SPACING.m,
  },
  backButtonText: {},
  scrollView: {
    flex: 1,
  },
  headerButton: {
    padding: SPACING.m,
    marginLeft: SPACING.s,
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
    alignSelf: 'flex-start',
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  profileImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: SPACING.l,
    borderWidth: 4,
    borderColor: COLORS.surfaceLight,
  },
  profileInfo: {
    alignItems: 'center',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  department: {
    fontSize: FONT_SIZE.m,
    marginBottom: SPACING.m,
  },
  detailsContainer: {
    gap: SPACING.s,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  detailText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  section: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  viewAll: {
    marginLeft: SPACING.s,
  },
  biography: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
  },
  readMore: {
    fontSize: FONT_SIZE.s,
  },
  creditCard: {
    width: 120,
    marginRight: SPACING.m,
  },
  creditPoster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  creditTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: 2,
  },
  creditYear: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  creditMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  creditRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs - 1,
  },
  creditRatingText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: SPACING.l,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    minWidth: 200,
    width: '87%',
    justifyContent: 'center',
  },
  favoritedButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
  },
  favoriteButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    marginLeft: SPACING.s,
  },
});
