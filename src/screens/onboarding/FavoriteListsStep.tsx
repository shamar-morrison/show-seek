import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import {
  AVAILABLE_TMDB_LISTS,
  MAX_HOME_LISTS,
  type TMDBListId,
} from '@/src/constants/homeScreenLists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import type { HomeScreenListItem } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const TMDB_LIST_CARD_IMAGE_SIZE = TMDB_IMAGE_SIZES.backdrop.medium;

interface HomeListVisual {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imagePath: string;
  fallbackColor: string;
}

const DEFAULT_HOME_LIST_COLOR = COLORS.surfaceLight;

const HOME_LIST_VISUALS: Partial<Record<TMDBListId, HomeListVisual>> = {
  'trending-movies': {
    mediaType: 'movie',
    tmdbId: 693134,
    imagePath: '/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    fallbackColor: '#201630',
  },
  'trending-tv': {
    mediaType: 'tv',
    tmdbId: 100088,
    imagePath: '/lY2DhbA7Hy44fAKddr06UrXWWaQ.jpg',
    fallbackColor: '#102527',
  },
  'popular-movies': {
    mediaType: 'movie',
    tmdbId: 19995,
    imagePath: '/vL5LR6WdxWPjLPFRLe133jXWsh5.jpg',
    fallbackColor: '#10293A',
  },
  'top-rated-movies': {
    mediaType: 'movie',
    tmdbId: 278,
    imagePath: '/zfbjgQE1uSd9wiPTX4VzsLi0rGG.jpg',
    fallbackColor: '#25211C',
  },
  'upcoming-movies': {
    mediaType: 'movie',
    tmdbId: 533535,
    imagePath: '/ufpeVEM64uZHPpzzeiDNIAdaeOD.jpg',
    fallbackColor: '#2B1118',
  },
  'upcoming-tv': {
    mediaType: 'tv',
    tmdbId: 94997,
    imagePath: '/2xGcSLyTAzConiHAByWqhfLiatT.jpg',
    fallbackColor: '#171F31',
  },
};

interface FavoriteListsStepProps {
  selectedLists: HomeScreenListItem[];
  onSelect: (lists: HomeScreenListItem[]) => void;
}

interface HomeListCardProps {
  listItem: (typeof AVAILABLE_TMDB_LISTS)[number];
  isSelected: boolean;
  isDisabled: boolean;
  onPress: () => void;
}

function HomeListCard({ listItem, isSelected, isDisabled, onPress }: HomeListCardProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const visual = HOME_LIST_VISUALS[listItem.id];
  const imageUri = visual ? getImageUrl(visual.imagePath, TMDB_LIST_CARD_IMAGE_SIZE) : null;
  const shouldShowImage = Boolean(imageUri) && !hasImageError;
  const cardContent = (
    <LinearGradient
      colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.15)']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.listCardOverlay}
    >
      <Text style={styles.listLabel}>{listItem.label}</Text>
      {isSelected && (
        <View style={styles.checkBadge}>
          <Check size={14} color={COLORS.white} />
        </View>
      )}
    </LinearGradient>
  );

  useEffect(() => {
    setHasImageError(false);
  }, [imageUri]);

  return (
    <Pressable
      style={[
        styles.listCard,
        { backgroundColor: visual?.fallbackColor ?? DEFAULT_HOME_LIST_COLOR },
        isSelected && styles.listCardSelected,
        isDisabled && styles.listCardDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={listItem.label}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
    >
      {shouldShowImage ? (
        <ImageBackground
          source={{ uri: imageUri ?? undefined }}
          resizeMode="cover"
          style={styles.listCardImage}
          imageStyle={styles.listCardImage}
          onError={() => setHasImageError(true)}
        >
          {cardContent}
        </ImageBackground>
      ) : (
        cardContent
      )}
    </Pressable>
  );
}

export default function FavoriteListsStep({ selectedLists, onSelect }: FavoriteListsStepProps) {
  const { t } = useTranslation();

  const handleToggle = useCallback(
    (listItem: (typeof AVAILABLE_TMDB_LISTS)[number]) => {
      const exists = selectedLists.some((l) => l.id === listItem.id);

      if (exists) {
        onSelect(selectedLists.filter((l) => l.id !== listItem.id));
      } else {
        if (selectedLists.length >= MAX_HOME_LISTS) return;
        onSelect([
          ...selectedLists,
          { id: listItem.id, type: 'tmdb' as const, label: listItem.label },
        ]);
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [selectedLists, onSelect]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)}>
        <Text style={styles.title}>{t('personalOnboarding.listsTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.listsSubtitle')}</Text>
      </Animated.View>

      {selectedLists.length > 0 && (
        <Text style={styles.selectedCount}>
          {t('personalOnboarding.selected', { count: selectedLists.length })}
        </Text>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {AVAILABLE_TMDB_LISTS.filter((item) => item.id !== 'latest-trailers').map(
          (listItem, index) => {
            const isSelected = selectedLists.some((l) => l.id === listItem.id);
            const isDisabled = !isSelected && selectedLists.length >= MAX_HOME_LISTS;

            return (
              <Animated.View
                key={listItem.id}
                entering={FadeInDown.duration(300).delay(index * 60)}
              >
                <HomeListCard
                  listItem={listItem}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                  onPress={() => handleToggle(listItem)}
                />
              </Animated.View>
            );
          }
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
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
    marginBottom: SPACING.m,
    lineHeight: 20,
  },
  selectedCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    gap: SPACING.s,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 110,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  listCardSelected: {
    borderColor: 'rgba(255,255,255,0.15)',
  },
  listCardDisabled: {
    opacity: 0.4,
  },
  listCardImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  listCardOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: SPACING.l,
  },
  listLabel: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '800',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
