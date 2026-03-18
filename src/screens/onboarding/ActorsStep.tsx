import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES, type Person } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface ActorsStepProps {
  selectedActors: Person[];
  onSelect: (actors: Person[]) => void;
}

export default function ActorsStep({ selectedActors, onSelect }: ActorsStepProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', 'popularPeople'],
    queryFn: () => tmdbApi.getPopularPeople(),
    staleTime: 1000 * 60 * 30,
  });

  // Filter to only actors
  const actors = (data?.results ?? []).filter(
    (p) => p.known_for_department === 'Acting' && p.profile_path
  );

  const selectedIds = useMemo(() => new Set(selectedActors.map((a) => a.id)), [selectedActors]);

  const handleToggle = useCallback(
    (actor: Person) => {
      if (selectedIds.has(actor.id)) {
        onSelect(selectedActors.filter((a) => a.id !== actor.id));
      } else {
        onSelect([...selectedActors, actor]);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedActors, selectedIds, onSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: Person }) => {
      const isSelected = selectedIds.has(item.id);
      const uri = getImageUrl(item.profile_path, TMDB_IMAGE_SIZES.profile.medium);

      return (
        <Pressable
          style={[styles.actorCard, isSelected && { borderColor: accentColor }]}
          onPress={() => handleToggle(item)}
        >
          {uri ? (
            <MediaImage source={{ uri }} style={styles.actorImage} contentFit="cover" />
          ) : (
            <View style={[styles.actorImage, styles.actorPlaceholder]}>
              <User size={24} color={COLORS.textSecondary} />
            </View>
          )}
          <Text style={styles.actorName} numberOfLines={2}>
            {item.name}
          </Text>
          {isSelected && (
            <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
              <Check size={12} color={COLORS.white} />
            </View>
          )}
        </Pressable>
      );
    },
    [accentColor, handleToggle, selectedIds]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.header}>
        <Text style={styles.title}>{t('personalOnboarding.actorsTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.actorsSubtitle')}</Text>
        {selectedActors.length > 0 && (
          <Text style={styles.selectedCount}>
            {t('personalOnboarding.selected', { count: selectedActors.length })}
          </Text>
        )}
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : (
        <FlashList
          data={actors}
          renderItem={renderItem}
          numColumns={3}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  selectedCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  actorCard: {
    flex: 1,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.surface,
  },
  actorImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  actorPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
    fontWeight: '600',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
