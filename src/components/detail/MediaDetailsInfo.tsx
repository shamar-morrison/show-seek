import { MovieDetails, TVShowDetails } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useRegion } from '@/src/context/RegionProvider';
import { getCountryFlag } from '@/src/utils/countries';
import { getLanguageName } from '@/src/utils/languages';
import { getRegionalCertification } from '@/src/utils/mediaUtils';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface MediaDetailsInfoProps {
  media: MovieDetails | TVShowDetails;
  type: 'movie' | 'tv';
}

export const MediaDetailsInfo = ({ media, type }: MediaDetailsInfoProps) => {
  const { region } = useRegion();
  const isMovie = type === 'movie';
  const movie = isMovie ? (media as MovieDetails) : null;
  const show = !isMovie ? (media as TVShowDetails) : null;

  const getCertificationDisplay = () => {
    // Check regional certification first
    const regionalCert = getRegionalCertification(media, type, region);
    if (regionalCert !== 'N/A') {
      let hasRegionalCert = false;
      if (isMovie && movie?.release_dates) {
        const regionData = movie.release_dates.results.find((r) => r.iso_3166_1 === region);
        if (regionData?.release_dates?.some((d) => d.certification)) {
          hasRegionalCert = true;
        }
      } else if (!isMovie && show?.content_ratings) {
        const regionData = show.content_ratings.results.find((r) => r.iso_3166_1 === region);
        if (regionData?.rating) {
          hasRegionalCert = true;
        }
      }

      if (hasRegionalCert) {
        return { cert: regionalCert, flag: region };
      }
      return { cert: regionalCert, flag: 'US' };
    }
    return { cert: 'N/A', flag: null };
  };

  const { cert, flag } = getCertificationDisplay();

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
          <View>
            {media.production_countries.map((c) => (
              <Text key={c.iso_3166_1} style={styles.listItemValue}>
                {c.name} {getCountryFlag(c.iso_3166_1)}
              </Text>
            ))}
          </View>
        ) : (
          'N/A'
        )
      )}
      {renderRow(
        'Certification',
        <Text>
          {cert} {flag ? getCountryFlag(flag) : ''}
        </Text>
      )}
      {renderRow(
        'Companies',
        media.production_companies.length > 0 ? (
          <View>
            {media.production_companies.map((c) => (
              <Text key={c.id} style={styles.listItemValue}>
                {c.name}
              </Text>
            ))}
          </View>
        ) : (
          'N/A'
        )
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
    textAlign: 'left',
  },
  listItemValue: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    flexShrink: 1,
  },
});
