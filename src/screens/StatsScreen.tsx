import { EmptyState } from '@/src/components/library/EmptyState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useHistory } from '@/src/hooks/useHistory';
import { screenStyles } from '@/src/styles/screenStyles';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import type { MonthlyStats } from '@/src/types/history';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  Clock,
  Flame,
  Minus,
  Plus,
  Star,
  Trophy,
  Tv,
} from 'lucide-react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Stats card for displaying a single metric
 */
function StatCard({
  icon: Icon,
  label,
  value,
  iconColor = COLORS.primary,
}: {
  icon: typeof Flame;
  label: string;
  value: string | number;
  iconColor?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Icon size={24} color={iconColor} />
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
        <Minus size={12} color={COLORS.textSecondary} />
        <Text style={[styles.comparisonText, { color: COLORS.textSecondary }]}>
          {t('stats.noChange', { label })}
        </Text>
      </View>
    );
  }

  const isPositive = value > 0;
  const color = isPositive ? COLORS.success : COLORS.error;
  const Icon = isPositive ? ArrowUp : ArrowDown;

  return (
    <View style={styles.comparisonBadge}>
      <Icon size={12} color={color} />
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
  const hasActivity = stats.watched > 0 || stats.rated > 0 || stats.addedToLists > 0;

  return (
    <TouchableOpacity style={styles.monthRow} onPress={onPress} activeOpacity={ACTIVE_OPACITY}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthName}>{stats.monthName}</Text>
        {stats.comparisonToPrevious && (
          <ComparisonBadge value={stats.comparisonToPrevious.watched} label={t('stats.vsLastMonth')} />
        )}
      </View>

      {hasActivity ? (
        <View style={styles.monthStats}>
          <View style={styles.monthStatItem}>
            <Tv size={16} color={COLORS.textSecondary} />
            <Text style={styles.monthStatValue}>{stats.watched}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.watched')}</Text>
          </View>

          <View style={styles.monthStatItem}>
            <Star size={16} color={COLORS.warning} />
            <Text style={styles.monthStatValue}>{stats.averageRating ?? '-'}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.avgRating')}</Text>
          </View>

          <View style={styles.monthStatItem}>
            <Plus size={16} color={COLORS.success} />
            <Text style={styles.monthStatValue}>{stats.addedToLists}</Text>
            <Text style={styles.monthStatLabel}>{t('stats.added')}</Text>
          </View>
        </View>
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
  const { data: historyData, isLoading, error } = useHistory();

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
        <EmptyState
          icon={BarChart3}
          title={t('stats.errorTitle')}
          description={t('stats.errorDescription')}
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
          icon={BarChart3}
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
          <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
            {t('stats.last6MonthsOverview')}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Tv}
              label={t('stats.watched')}
              value={historyData.totalWatched}
              iconColor={COLORS.primary}
            />
            <StatCard
              icon={Star}
              label={t('stats.rated')}
              value={historyData.totalRated}
              iconColor={COLORS.warning}
            />
            <StatCard
              icon={Plus}
              label={t('stats.added')}
              value={historyData.totalAddedToLists}
              iconColor={COLORS.success}
            />
          </View>
        </View>

        {/* Streaks Section */}
        <View style={styles.section}>
          <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>{t('stats.streaks')}</Text>
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              <Flame size={28} color="#FF6B35" />
              <View style={styles.streakInfo}>
                <Text style={styles.streakValue}>
                  {t('stats.streakValue', { count: historyData.currentStreak })}
                </Text>
                <Text style={styles.streakLabel}>{t('stats.currentStreak')}</Text>
              </View>
            </View>
            <View style={styles.streakItem}>
              <Trophy size={28} color="#FFD700" />
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
                  <Calendar size={24} color={COLORS.primary} />
                  <Text style={styles.patternValue}>{historyData.mostActiveDay}</Text>
                  <Text style={styles.patternLabel}>{t('stats.mostActiveDay')}</Text>
                </View>
              )}
              {historyData.mostActiveTimeOfDay && (
                <View style={styles.patternItem}>
                  <Clock size={24} color={COLORS.primary} />
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
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.m,
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: '600',
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
    fontWeight: 'bold',
    color: COLORS.text,
  },
  monthStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
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
