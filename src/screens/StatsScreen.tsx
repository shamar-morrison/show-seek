import { EmptyState } from '@/src/components/library/EmptyState';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useHistory } from '@/src/hooks/useHistory';
import type { MonthlyStats } from '@/src/types/history';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  Clock,
  Flame,
  Info,
  Minus,
  Plus,
  Star,
  Trophy,
  Tv,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  if (value === 0) {
    return (
      <View style={styles.comparisonBadge}>
        <Minus size={12} color={COLORS.textSecondary} />
        <Text style={[styles.comparisonText, { color: COLORS.textSecondary }]}>
          No change {label}
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
  const hasActivity = stats.watched > 0 || stats.rated > 0 || stats.addedToLists > 0;

  return (
    <TouchableOpacity style={styles.monthRow} onPress={onPress} activeOpacity={ACTIVE_OPACITY}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthName}>{stats.monthName}</Text>
        {stats.comparisonToPrevious && (
          <ComparisonBadge value={stats.comparisonToPrevious.watched} label="vs last month" />
        )}
      </View>

      {hasActivity ? (
        <View style={styles.monthStats}>
          <View style={styles.monthStatItem}>
            <Tv size={16} color={COLORS.textSecondary} />
            <Text style={styles.monthStatValue}>{stats.watched}</Text>
            <Text style={styles.monthStatLabel}>watched</Text>
          </View>

          <View style={styles.monthStatItem}>
            <Star size={16} color={COLORS.warning} />
            <Text style={styles.monthStatValue}>{stats.averageRating ?? '-'}</Text>
            <Text style={styles.monthStatLabel}>avg rating</Text>
          </View>

          <View style={styles.monthStatItem}>
            <Plus size={16} color={COLORS.success} />
            <Text style={styles.monthStatValue}>{stats.addedToLists}</Text>
            <Text style={styles.monthStatLabel}>added</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noActivityText}>No activity this month</Text>
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

// TODO: Remove this banner and related code after 2024-12-27 (legacy data migration complete)
const LEGACY_BANNER_DISMISSED_KEY = '@stats_legacy_banner_dismissed';

export default function StatsScreen() {
  const router = useRouter();
  const { data: historyData, isLoading, error } = useHistory();
  const [bannerDismissed, setBannerDismissed] = useState(true); // Start hidden to prevent flash

  // Load banner dismissed state from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(LEGACY_BANNER_DISMISSED_KEY).then((value) => {
      setBannerDismissed(value === 'true');
    });
  }, []);

  const dismissBanner = useCallback(async () => {
    setBannerDismissed(true);
    await AsyncStorage.setItem(LEGACY_BANNER_DISMISSED_KEY, 'true');
  }, []);

  const handleMonthPress = useCallback(
    (month: string) => {
      router.push(`/(tabs)/library/stats/${month}` as any);
    },
    [router]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your stats...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={BarChart3}
          title="Error Loading Stats"
          description="Something went wrong. Please try again later."
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
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={BarChart3}
          title="No Activity Yet"
          description="Start watching, rating, and adding items to see your stats here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info banner for legacy data - TODO: Remove after 2024-12-27 */}
        {!bannerDismissed && (
          <View style={styles.infoBanner}>
            <Info size={16} color={COLORS.background} />
            <Text style={styles.infoBannerText}>
              Stats work best with new activity. Older data may show limited details.
            </Text>
            <TouchableOpacity
              onPress={dismissBanner}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color={COLORS.background} />
            </TouchableOpacity>
          </View>
        )}

        {/* Overview Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LAST 6 MONTHS OVERVIEW</Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Tv}
              label="Watched"
              value={historyData.totalWatched}
              iconColor={COLORS.primary}
            />
            <StatCard
              icon={Star}
              label="Rated"
              value={historyData.totalRated}
              iconColor={COLORS.warning}
            />
            <StatCard
              icon={Plus}
              label="Added"
              value={historyData.totalAddedToLists}
              iconColor={COLORS.success}
            />
          </View>
        </View>

        {/* Streaks Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STREAKS</Text>
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              <Flame size={28} color="#FF6B35" />
              <View style={styles.streakInfo}>
                <Text style={styles.streakValue}>{historyData.currentStreak} days</Text>
                <Text style={styles.streakLabel}>Current Streak</Text>
              </View>
            </View>
            <View style={styles.streakItem}>
              <Trophy size={28} color="#FFD700" />
              <View style={styles.streakInfo}>
                <Text style={styles.streakValue}>{historyData.longestStreak} days</Text>
                <Text style={styles.streakLabel}>Longest Streak</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Activity Patterns Section */}
        {(historyData.mostActiveDay || historyData.mostActiveTimeOfDay) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACTIVITY PATTERNS</Text>
            <View style={styles.patternRow}>
              {historyData.mostActiveDay && (
                <View style={styles.patternItem}>
                  <Calendar size={24} color={COLORS.primary} />
                  <Text style={styles.patternValue}>{historyData.mostActiveDay}s</Text>
                  <Text style={styles.patternLabel}>Most Active Day</Text>
                </View>
              )}
              {historyData.mostActiveTimeOfDay && (
                <View style={styles.patternItem}>
                  <Clock size={24} color={COLORS.primary} />
                  <Text style={styles.patternValue}>{historyData.mostActiveTimeOfDay}</Text>
                  <Text style={styles.patternLabel}>Preferred Time</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Monthly Breakdown Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MONTHLY BREAKDOWN</Text>
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.m,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginBottom: SPACING.l,
  },
  infoBannerText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.background,
    fontWeight: '500',
  },
});
