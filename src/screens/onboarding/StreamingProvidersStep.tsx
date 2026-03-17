import { tmdbApi, type WatchProvider, getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w154';

export default function StreamingProvidersStep() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding', 'watchProviders'],
    queryFn: () => tmdbApi.getWatchProviders('movie'),
    staleTime: 1000 * 60 * 60, // 1 hour — providers rarely change
  });

  // Take top ~30 providers sorted by display priority
  const providers = (data ?? []).slice(0, 30);

  const handleToggle = useCallback(
    (provider: WatchProvider) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(provider.provider_id)) {
          next.delete(provider.provider_id);
        } else {
          next.add(provider.provider_id);
        }
        return next;
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: WatchProvider }) => {
      const isSelected = selectedIds.has(item.provider_id);
      const logoUri = `${TMDB_LOGO_BASE}${item.logo_path}`;

      return (
        <Pressable
          style={[styles.providerCard, isSelected && { borderColor: accentColor }]}
          onPress={() => handleToggle(item)}
        >
          <MediaImage
            source={{ uri: logoUri }}
            style={styles.providerLogo}
            contentFit="cover"
          />
          {isSelected && (
            <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
              <Check size={12} color={COLORS.white} />
            </View>
          )}
          <Text style={styles.providerName} numberOfLines={1}>
            {item.provider_name}
          </Text>
        </Pressable>
      );
    },
    [accentColor, handleToggle, selectedIds]
  );

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.header}>
        <Text style={styles.title}>{t('personalOnboarding.streamingProvidersTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.streamingProvidersSubtitle')}</Text>
        {selectedIds.size > 0 && (
          <Text style={styles.selectedCount}>
            {t('personalOnboarding.selected', { count: selectedIds.size })}
          </Text>
        )}
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColor} />
        </View>
      ) : (
        <FlashList
          data={providers}
          renderItem={renderItem}
          numColumns={3}
          keyExtractor={(item) => item.provider_id.toString()}
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
  providerCard: {
    flex: 1,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingBottom: SPACING.s,
    backgroundColor: COLORS.surface,
  },
  providerLogo: {
    width: '100%',
    aspectRatio: 1,
    borderTopLeftRadius: BORDER_RADIUS.m - 2,
    borderTopRightRadius: BORDER_RADIUS.m - 2,
    backgroundColor: COLORS.surfaceLight,
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
  providerName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    textAlign: 'center',
    fontWeight: '500',
  },
});
