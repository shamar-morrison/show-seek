import { MovieDetails, TVShowDetails } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { getCountryFlag } from '@/src/utils/countries';
import { getLanguageName } from '@/src/utils/languages';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface MediaDetailsInfoProps {
  media: MovieDetails | TVShowDetails;
  type: 'movie' | 'tv';
}

export const MediaDetailsInfo = ({ media, type }: MediaDetailsInfoProps) => {
  const isMovie = type === 'movie';
  const movie = isMovie ? (media as MovieDetails) : null;
  const show = !isMovie ? (media as TVShowDetails) : null;

  const getCertification = () => {
    if (isMovie && movie?.release_dates) {
      const usRelease = movie.release_dates.results.find((r) => r.iso_3166_1 === 'US');
      if (usRelease) {
        // Prioritize theatrical release (type 3) or digital (4)
        const release =
          usRelease.release_dates.find((d) => d.type === 3) ||
          usRelease.release_dates.find((d) => d.type === 4) ||
          usRelease.release_dates[0];
        return release?.certification || 'N/A';
      }
    } else if (!isMovie && show?.content_ratings) {
      const usRating = show.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
      return usRating?.rating || 'N/A';
    }
    return 'N/A';
  };

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} hrs ${m} mins`;
  };

  const formatMoney = (amount: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderRow = (label: string, value: string | React.ReactNode) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Details</Text>
      {renderRow('Original Title', isMovie ? movie!.original_title : show!.original_name)}
      {renderRow('Status', media.status)}
      {renderRow(
        'Runtime',
        isMovie
          ? formatRuntime(movie!.runtime)
          : show!.episode_run_time?.length > 0
            ? formatRuntime(show!.episode_run_time[0])
            : 'N/A'
      )}
      {renderRow('Original Language', getLanguageName(media.original_language))}
      {renderRow(
        'Production Countries',
        media.production_countries.length > 0 ? (
          <Text>
            {media.production_countries.map((c) => (
              <Text key={c.iso_3166_1}>
                {c.name} {getCountryFlag(c.iso_3166_1)}{' '}
              </Text>
            ))}
          </Text>
        ) : (
          'N/A'
        )
      )}
      {renderRow(
        'Certification',
        <Text>
          {getCertification()} {getCountryFlag('US')}
        </Text>
      )}
      {renderRow(
        'Companies',
        media.production_companies.length > 0
          ? media.production_companies.map((c) => c.name).join(', ')
          : 'N/A'
      )}
      {isMovie && renderRow('Budget', formatMoney(movie!.budget))}
      {isMovie && renderRow('Revenue', formatMoney(movie!.revenue))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    flex: 1,
  },
  value: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    flex: 1,
    textAlign: 'right',
  },
});
