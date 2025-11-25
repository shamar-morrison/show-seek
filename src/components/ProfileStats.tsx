import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useWatchlist, useRatings } from '@/src/hooks/useFirestore';
import { AnimatedCounter } from '@/src/components/ui/AnimatedCounter';
import {
  Film,
  Tv,
  Bookmark,
  Star,
  TrendingUp,
  Sparkles,
  Clock,
  Calendar,
  Flame,
} from 'lucide-react-native';

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  subtitle?: string;
  decimals?: number;
  color?: string;
}

function StatCard({ icon, value, label, subtitle, decimals = 0, color = COLORS.primary }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          {icon}
        </View>
      </View>
      <AnimatedCounter 
        value={value} 
        style={styles.statValue}
        decimals={decimals}
      />
      <Text style={styles.statLabel}>{label}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export function ProfileStats() {
  const { user } = useAuth();
  const { watchlist } = useWatchlist();
  const { ratings } = useRatings();

  // Calculate stats
  const stats = useMemo(() => {
    const moviesInWatchlist = watchlist.filter(item => item.mediaType === 'movie').length;
    const showsInWatchlist = watchlist.filter(item => item.mediaType === 'tv').length;
    const totalRatings = ratings.length;
    
    const averageRating = totalRatings > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
      : 0;

    // Get personality message based on average rating
    let ratingPersonality = '';
    if (averageRating > 0) {
      if (averageRating >= 8) {
        ratingPersonality = "You love everything! 🎉";
      } else if (averageRating >= 7) {
        ratingPersonality = "Pretty generous! 😊";
      } else if (averageRating >= 6) {
        ratingPersonality = "Balanced critic 🎭";
      } else if (averageRating >= 5) {
        ratingPersonality = "Tough critic! 🤔";
      } else {
        ratingPersonality = "Very selective! 😤";
      }
    }

    // Placeholder calculations
    const moviesWatched = Math.floor(Math.random() * 100) + 50; // Placeholder
    const showsWatched = Math.floor(Math.random() * 50) + 20; // Placeholder
    const favoriteGenre = 'Action'; // Placeholder
    const hoursInWatchlist = Math.floor(Math.random() * 200) + 100; // Placeholder
    const streakDays = Math.floor(Math.random() * 30) + 1; // Placeholder
    
    // Member since (from Firebase user metadata)
    const memberSince = user?.metadata?.creationTime 
      ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short' 
        })
      : 'Recently';

    return {
      moviesWatched,
      showsWatched,
      moviesInWatchlist,
      showsInWatchlist,
      totalRatings,
      averageRating,
      ratingPersonality,
      favoriteGenre,
      hoursInWatchlist,
      memberSince,
      streakDays,
    };
  }, [watchlist, ratings, user]);

  const iconSize = 20;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Your Stats</Text>
      
      <View style={styles.statsGrid}>
        <StatCard
          icon={<Film size={iconSize} color={COLORS.primary} />}
          value={stats.moviesWatched}
          label="Movies Rated"
          color={COLORS.primary}
        />
        
        <StatCard
          icon={<Tv size={iconSize} color="#9C27B0" />}
          value={stats.showsWatched}
          label="TV Shows Rated"
          color="#9C27B0"
        />

        <StatCard
          icon={<Bookmark size={iconSize} color="#FF9800" />}
          value={stats.moviesInWatchlist}
          label="Movies Watchlist"
          color="#FF9800"
        />

        <StatCard
          icon={<Bookmark size={iconSize} color="#00BCD4" />}
          value={stats.showsInWatchlist}
          label="Shows Watchlist"
          color="#00BCD4"
        />

        <StatCard
          icon={<Star size={iconSize} color="#FFC107" />}
          value={stats.totalRatings}
          label="Total Ratings"
          color="#FFC107"
        />

        <StatCard
          icon={<TrendingUp size={iconSize} color="#4CAF50" />}
          value={stats.averageRating}
          label="Average Rating"
          subtitle={stats.ratingPersonality}
          decimals={1}
          color="#4CAF50"
        />

        <StatCard
          icon={<Sparkles size={iconSize} color="#E91E63" />}
          value={0}
          label="Favorite Genre"
          subtitle={stats.favoriteGenre}
          color="#E91E63"
        />

        <StatCard
          icon={<Clock size={iconSize} color="#673AB7" />}
          value={stats.hoursInWatchlist}
          label="Hours Queued"
          subtitle="In watchlist"
          color="#673AB7"
        />

        <StatCard
          icon={<Calendar size={iconSize} color="#3F51B5" />}
          value={0}
          label="Member Since"
          subtitle={stats.memberSince}
          color="#3F51B5"
        />

        <StatCard
          icon={<Flame size={iconSize} color="#FF5722" />}
          value={stats.streakDays}
          label="Day Streak"
          subtitle="Keep it up! 🔥"
          color="#FF5722"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
  },
  statCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    width: '48%',
    borderLeftWidth: 3,
    minHeight: 120,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.s,
  },
  iconContainer: {
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  statSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
});
