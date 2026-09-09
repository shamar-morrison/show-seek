import { EmptyState } from '@/src/components/library/EmptyState';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useHistory } from '@/src/hooks/useHistory';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatWatchHours } from '@/src/utils/formatWatchTime';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import type { MonthlyStats } from '@/src/types/history';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  BarChartIcon,
  Calendar03Icon,
  Clock01Icon,
  FireIcon,
  Medal01Icon,
  MinusSignIcon,
  PlusSignIcon,
  StarIcon,
  Tv01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Stats card for displaying a single metric
 */
function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: IconSvgElement;
  label: string;
  value: string | number;
  iconColor: string;
}) {
  return (
    <View style={styles.statCard}>
      <AppIcon icon={Icon} size={24} color={iconColor} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Comparison indicator showing percentage change
 */
function ComparisonBadge({ value, label }: { value: number; label: string }) {
  const { t } = useTranslation();

  if (value === 0) {
    return (
      <View style={styles.comparisonBadge}>
        <AppIcon icon={MinusSignIcon} size={12} color={COLORS.textSecondary} />
        <Text style={[styles.comparisonText, { color: COLORS.textSecondary }]}>
          {t('stats.noChange', { label })}
        </Text>
      </View>
    );
  }

  const isPositive = value > 0;
  const color = isPositive ? COLORS.success : COLORS.error;
  const Icon = isPositive ? ArrowUp01Icon : ArrowDown01Icon;

  return (
    <View style={styles.comparisonBadge}>
      <AppIcon icon={Icon} size={12} color={color} />
      <Text style={[styles.comparisonText, { color }]}>
        {isPositive ? '+' : ''}
        {value}% {label}
      </Text>
    </View>
  );
}

/**
 * Monthly stats row component
 */
function MonthRow({ stats, onPress }: { stats: MonthlyStats; onPress: () => void }) {
  const { t } = useTranslation();
  const hasActivity =
    stats.watched > 0 ||
    stats.rated > 0 ||
    stats.addedToLists > 0 ||
    stats.totalWatchMinutes > 0;

  return (
    <TouchableOpacity style={styles.monthRow} onPress={onPress} activeOpacity={ACTIVE_OPACITY}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthName}>{stats.monthName}</Text>
        {stats.comparisonToPrevious && (
          <ComparisonBadge
            value={stats.comparisonToPrevious.watched}
            label={t('stats.vsLastMonth')}
          />
        )}
      </View>

      {hasActivity ? (
        <>
          <View style={styles.monthStats}>
          <View style={styles.monthStatItem}>
            <AppIcon icon={Tv01Icon} size={16} color={COLORS.textSecondary} />
            <Text style={styles.monthStatValue}>{stats.watched}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.watched')}</Text>
          </View>

          <View style={styles.monthStatItem}>
            <AppIcon icon={StarIcon} size={16} color={COLORS.warning} />
            <Text style={styles.monthStatValue}>{stats.averageRating ?? '-'}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.avgRating')}</Text>
          </View>

          <View style={styles.monthStatItem}>
            <AppIcon icon={PlusSignIcon} size={16} color={COLORS.success} />
            <Text style={styles.monthStatValue}>{stats.addedToLists}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.added')}</Text>
          </View>
        </View>
        <View style={styles.monthWatchTimeRow}>
          <View style={styles.monthWatchTimeTotal}>
            <AppIcon icon={Clock01Icon} size={16} color={COLORS.textSecondary} />
            <Text style={styles.monthStatValue}>{formatWatchHours(stats.totalWatchMinutes)}</Text>
          </View>
          <Text style={styles.monthStatLabel}>{t('stats.watchTime')}</Text>
        </View>
        </>
      ) : (
        <Text style={styles.noActivityText}>{t('stats.noActivityThisMonth')}</Text>
      )}

      {stats.topGenres.length > 0 && (
        <View style={styles.genresContainer}>
          {stats.topGenres.map((genre, index) => (
            <View key={index} style={styles.genreTag}>
              <Text style={styles.genreText}>{genre}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function StatsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { data: historyData, isLoading, isFetching, error, refetch } = useHistory();
  // Background refresh (e.g. measured watch-time runtimes landing) only.
  const showRefreshIndicator = isFetching && !isLoading && !!historyData;

  const handleMonthPress = useCallback(
    (month: string) => {
      router.push(`/(tabs)/library/stats/${month}` as any);
    },
    [router]
  );

  if (isLoading) {
    return <FullScreenLoading message={t('stats.loading')} />;
  }

  if (error) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <AppErrorState
          error={error}
          title={t('stats.errorTitle')}
          message={t('stats.errorDescription')}
          onRetry={() => {
            void refetch();
          }}
          accentColor={accentColor}
        />
      </SafeAreaView>
    );
  }

  const hasData =
    historyData &&
    (historyData.totalWatched > 0 ||
      historyData.totalRated > 0 ||
      historyData.totalAddedToLists > 0);

  if (!hasData) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={BarChartIcon}
          title={t('stats.noActivityTitle')}
          description={t('stats.noActivityDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Overview Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={sectionTitleStyles.title}>{t('stats.last6MonthsOverview')}</Text>
            {showRefreshIndicator && (
              <ActivityIndicator
                size="small"
                color={COLORS.textSecondary}
                accessibilityLabel={t('stats.updatingTotals')}
                testID="stats-refresh-indicator"
              />
            )}
          </View>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Tv01Icon}
              label={t('stats.watched')}
              value={historyData.totalWatched}
              iconColor={accentColor}
            />
            <StatCard
              icon={StarIcon}
              label={t('stats.rated')}
              value={historyData.totalRated}
              iconColor={COLORS.warning}
            />
            <StatCard
              icon={PlusSignIcon}
              label={t('stats.added')}
              value={historyData.totalAddedToLists}
              iconColor={COLORS.success}
            />
          </View>
          <View style={[styles.statsGrid, styles.overviewWatchRow]}>
            <StatCard
              icon={Clock01Icon}
              label={t('stats.totalHours')}
              value={formatWatchHours(historyData.totalWatchMinutes)}
              iconColor={accentColor}
            />
          </View>
        </View>

        {/* Streaks Section */}
        <View style={styles.section}>
          <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>{t('stats.streaks')}</Text>
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              <AppIcon icon={FireIcon} size={28} color="#FF6B35" />
              <View style={styles.streakInfo}>
                <Text style={styles.streakValue}>
                  {t('stats.streakValue', { count: historyData.currentStreak })}
                </Text>
                <Text style={styles.streakLabel}>{t('stats.currentStreak')}</Text>
              </View>
            </View>
            <View style={styles.streakItem}>
              <AppIcon icon={Medal01Icon} size={28} color="#FFD700" />
              <View style={styles.streakInfo}>
                <Text style={styles.streakValue}>
                  {t('stats.streakValue', { count: historyData.longestStreak })}
                </Text>
                <Text style={styles.streakLabel}>{t('stats.longestStreak')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Activity Patterns Section */}
        {(historyData.mostActiveDay || historyData.mostActiveTimeOfDay) && (
          <View style={styles.section}>
            <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
              {t('stats.activityPatterns')}
            </Text>
            <View style={styles.patternRow}>
              {historyData.mostActiveDay && (
                <View style={styles.patternItem}>
                  <AppIcon icon={Calendar03Icon} size={24} color={accentColor} />
                  <Text style={styles.patternValue}>{historyData.mostActiveDay}</Text>
                  <Text style={styles.patternLabel}>{t('stats.mostActiveDay')}</Text>
                </View>
              )}
              {historyData.mostActiveTimeOfDay && (
                <View style={styles.patternItem}>
                  <AppIcon icon={Clock01Icon} size={24} color={accentColor} />
                  <Text style={styles.patternValue}>{historyData.mostActiveTimeOfDay}</Text>
                  <Text style={styles.patternLabel}>{t('stats.preferredTime')}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Monthly Breakdown Section */}
        <View style={styles.section}>
          <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
            {t('stats.monthlyBreakdown')}
          </Text>
          {historyData.monthlyStats.map((monthStats) => (
            <MonthRow
              key={monthStats.month}
              stats={monthStats}
              onPress={() => handleMonthPress(monthStats.month)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    marginBottom: SPACING.m,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.m,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  overviewWatchRow: {
    marginTop: SPACING.m,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginTop: SPACING.s,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  streakRow: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  streakItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
  },
  streakInfo: {
    marginLeft: SPACING.m,
  },
  streakValue: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  streakLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  patternRow: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  patternItem: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    alignItems: 'center',
  },
  patternValue: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginTop: SPACING.s,
  },
  patternLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  monthRow: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    marginBottom: SPACING.m,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  monthName: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
  comparisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  comparisonText: {
    fontSize: FONT_SIZE.xs,
  },
  monthStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  monthStatItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  monthStatValue: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  monthStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  monthWatchTimeRow: {
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  monthWatchTimeTotal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  noActivityText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontStyle: 'italic',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  genreTag: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  genreText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});
