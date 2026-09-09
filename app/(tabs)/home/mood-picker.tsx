import { getRandomMood, MOODS, type MoodConfig } from '@/src/constants/moods';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { useQueries } from '@tanstack/react-query';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ShuffleIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TMDB_MOOD_CARD_IMAGE_SIZE = TMDB_IMAGE_SIZES.backdrop.medium;
const MOOD_BACKDROP_CACHE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface MoodCardProps {
  mood: MoodConfig;
  index: number;
  backdropPath: string | null | undefined;
  onPress: (moodId: string) => void;
}

/**
 * Individual mood card with animated entrance.
 * Full-width image row (mirrors onboarding genre cards): TMDB backdrop with
 * dark gradient overlay, mood icon on the left, title/description on the right.
 */
function MoodCard({ mood, index, backdropPath, onPress }: MoodCardProps) {
  const { t } = useTranslation();
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const [hasImageError, setHasImageError] = useState(false);
  const imageUri = backdropPath ? getImageUrl(backdropPath, TMDB_MOOD_CARD_IMAGE_SIZE) : null;
  const shouldShowImage = Boolean(imageUri) && !hasImageError;

  useEffect(() => {
    setHasImageError(false);
  }, [imageUri]);

  // Staggered entrance animation
  React.useEffect(() => {
    const delay = index * 80;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
  }, [index, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    onPress(mood.id);
  };

  // Extract translation keys from mood.translationKey (e.g., 'mood.cozy')
  const moodKey = mood.translationKey.replace('mood.', '');
  const nameKey = `mood.${moodKey}.name`;
  const descKey = `mood.${moodKey}.description`;

  const cardContent = (
    <LinearGradient
      colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.1)']}
      start={{ x: 0.5, y: 1 }}
      end={{ x: 0.5, y: 0 }}
      style={styles.moodCardOverlay}
    >
      <View style={[styles.moodIconBadge, { backgroundColor: mood.color + '35' }]}>
        <AppIcon icon={mood.icon} size={28} color={COLORS.text} />
      </View>
      <View style={styles.moodTextContainer}>
        <Text style={styles.moodName}>{t(nameKey)}</Text>
        <Text style={styles.moodDescription} numberOfLines={2}>
          {t(descKey)}
        </Text>
      </View>
    </LinearGradient>
  );

  return (
    <AnimatedPressable
      style={[styles.moodCard, { backgroundColor: mood.color + '20' }, animatedStyle]}
      onPress={handlePress}
    >
      {shouldShowImage ? (
        <ImageBackground
          source={{ uri: imageUri ?? undefined }}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={styles.moodCardImage}
          onError={() => setHasImageError(true)}
        >
          {cardContent}
        </ImageBackground>
      ) : (
        cardContent
      )}
    </AnimatedPressable>
  );
}

/**
 * Mood Picker screen for selecting a mood to discover content.
 */
export default function MoodPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const [isSpinning, setIsSpinning] = useState(false);
  const surpriseRotation = useSharedValue(0);

  // Fetch a curated backdrop per mood (cached for 30 days, persisted across
  // restarts via the query cache layer, so revisits don't refetch).
  const backdropQueries = useQueries({
    queries: MOODS.map((mood) => ({
      queryKey: ['mood', 'backdrop', mood.id],
      queryFn: async () => {
        try {
          const details =
            mood.visual.sourceMediaType === 'tv'
              ? await tmdbApi.getTVShowDetails(mood.visual.tmdbId)
              : await tmdbApi.getMovieDetails(mood.visual.tmdbId);
          return details.backdrop_path ?? null;
        } catch {
          return null;
        }
      },
      staleTime: MOOD_BACKDROP_CACHE_MS,
      gcTime: MOOD_BACKDROP_CACHE_MS,
    })),
  });
  const backdropByMoodId = useMemo(() => {
    const map: Record<string, string | null> = {};
    MOODS.forEach((mood, i) => {
      map[mood.id] = backdropQueries[i]?.data ?? null;
    });
    return map;
  }, [backdropQueries]);

  const handleMoodSelect = useCallback(
    (moodId: string) => {
      router.push({
        pathname: '/(tabs)/home/mood-results',
        params: { moodId },
      });
    },
    [router]
  );

  const navigateToRandomMood = useCallback(() => {
    const randomMood = getRandomMood();
    handleMoodSelect(randomMood.id);
  }, [handleMoodSelect]);

  // Ref to store timeout ID for cleanup
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleSurpriseMe = () => {
    if (isSpinning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSpinning(true);

    // Spin animation then navigate
    surpriseRotation.value = withSequence(
      withTiming(360 * 3, { duration: 800 }),
      withTiming(0, { duration: 0 })
    );

    // Navigate after animation
    timeoutRef.current = setTimeout(() => {
      setIsSpinning(false);
      navigateToRandomMood();
    }, 850);
  };

  const surpriseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${surpriseRotation.value}deg` }],
  }));

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('mood.title')}</Text>
          <Text style={styles.subtitle}>{t('mood.subtitle')}</Text>
        </View>

        {/* Mood List */}
        <View style={styles.moodList}>
          {MOODS.map((mood, index) => (
            <MoodCard
              key={mood.id}
              mood={mood}
              index={index}
              backdropPath={backdropByMoodId[mood.id]}
              onPress={handleMoodSelect}
            />
          ))}
        </View>

        {/* Surprise Me Button */}
        <Pressable
          style={[styles.surpriseButton, { backgroundColor: accentColor }]}
          onPress={handleSurpriseMe}
          disabled={isSpinning}
        >
          <Animated.View style={surpriseAnimatedStyle}>
            <AppIcon icon={ShuffleIcon} size={24} color={COLORS.text} />
          </Animated.View>
          <Text style={styles.surpriseButtonText}>{t('mood.surpriseMe')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.l,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  moodList: {
    gap: SPACING.s,
  },
  moodCard: {
    height: 110,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  moodCardImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  moodCardOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: SPACING.l,
    gap: SPACING.m,
  },
  moodIconBadge: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodTextContainer: {
    flex: 1,
  },
  moodName: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  moodDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  surpriseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    marginTop: SPACING.xl,
  },
  surpriseButtonText: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
});
