import { MovieDetails, TVShowDetails } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useRegion } from '@/src/context/RegionProvider';
import i18n from '@/src/i18n';
import { getCountryFlag } from '@/src/utils/countries';
import { getLanguageName } from '@/src/utils/languages';
import { getRegionalCertification } from '@/src/utils/mediaUtils';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface MediaDetailsInfoProps {
  media: MovieDetails | TVShowDetails;
  type: 'movie' | 'tv';
}

export const MediaDetailsInfo = ({ media, type }: MediaDetailsInfoProps) => {
  const { t } = useTranslation();
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
    if (!minutes) return t('common.notAvailable');
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) return t('mediaDetails.runtimeMinutes', { count: mins });
    if (mins === 0) return t('mediaDetails.runtimeHours', { count: hours });
    return t('mediaDetails.runtimeHoursMinutes', { hours, minutes: mins });
  };

  const formatMoney = (amount: number) => {
    if (!amount) return t('common.notAvailable');
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderRow = (label: string, value: string | React.ReactNode) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={styles.value}>{value}</Text>
      ) : (
        <View style={styles.valueContainer}>{value}</View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('media.details')}</Text>
      {renderRow(t('mediaDetails.originalTitle'), isMovie ? movie!.original_title : show!.original_name)}
      {renderRow(t('media.status'), media.status)}
      {renderRow(
        t('media.runtime'),
        isMovie
          ? formatRuntime(movie!.runtime)
          : show!.episode_run_time?.length > 0
            ? formatRuntime(show!.episode_run_time[0])
            : t('common.notAvailable')
      )}
      {renderRow(t('mediaDetails.originalLanguage'), getLanguageName(media.original_language))}
      {renderRow(
        t('mediaDetails.productionCountries'),
        media.production_countries.length > 0 ? (
          <View>
            {media.production_countries.map((c) => (
              <Text key={c.iso_3166_1} style={styles.listItemValue}>
                {c.name} {getCountryFlag(c.iso_3166_1)}
              </Text>
            ))}
          </View>
        ) : (
          t('common.notAvailable')
        )
      )}
      {renderRow(
        t('mediaDetails.certification'),
        <Text>
          {cert === 'N/A' ? t('common.notAvailable') : cert} {flag ? getCountryFlag(flag) : ''}
        </Text>
      )}
      {renderRow(
        t('mediaDetails.companies'),
        media.production_companies.length > 0 ? (
          <View>
            {media.production_companies.map((c) => (
              <Text key={c.id} style={styles.listItemValue}>
                {c.name}
              </Text>
            ))}
          </View>
        ) : (
          t('common.notAvailable')
        )
      )}
      {isMovie && renderRow(t('mediaDetails.budget'), formatMoney(movie!.budget))}
      {isMovie && renderRow(t('mediaDetails.revenue'), formatMoney(movie!.revenue))}
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
  valueContainer: {
    flex: 1,
    alignItems: 'flex-start',
  },
  listItemValue: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    flexShrink: 1,
  },
});
