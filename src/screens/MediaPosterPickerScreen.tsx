import {
  getImageUrl,
  TMDB_IMAGE_SIZES,
  tmdbApi,
  type ImageData,
  type MovieDetails,
  type TVShowDetails,
} from '@/src/api/tmdb';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { MediaImage } from '@/src/components/ui/MediaImage';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useClearPosterOverride, usePosterOverrides, useSetPosterOverride } from '@/src/hooks/usePosterOverrides';
import { usePreferences } from '@/src/hooks/usePreferences';
import { buildPosterOverrideKey, type PosterOverrideMediaType } from '@/src/utils/posterOverrides';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Image as ImageIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MediaPosterPickerScreenProps {
  mediaType: PosterOverrideMediaType;
}

type MediaDetails = MovieDetails | TVShowDetails;
type MediaImages = { backdrops: ImageData[]; posters: ImageData[] };

export default function MediaPosterPickerScreen({ mediaType }: MediaPosterPickerScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mediaId = Number(id);
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { preferences } = usePreferences();
  const toastRef = useRef<ToastRef>(null);
  const isAccountRequired = useAccountRequired();
  const { overrides, resolvePosterPath } = usePosterOverrides();
  const setOverrideMutation = useSetPosterOverride();
  const clearOverrideMutation = useClearPosterOverride();
  const [isBlocked, setIsBlocked] = useState(false);
  const [selectedPosterPath, setSelectedPosterPath] = useState<string | null>(null);

  const detailsQuery = useQuery<MediaDetails>({
    queryKey: [mediaType, mediaId],
    queryFn: (): Promise<MediaDetails> =>
      mediaType === 'movie' ? tmdbApi.getMovieDetails(mediaId) : tmdbApi.getTVShowDetails(mediaId),
    enabled: Number.isFinite(mediaId) && mediaId > 0 && !isBlocked,
  });

  const imagesQuery = useQuery<MediaImages>({
    queryKey: [mediaType, mediaId, 'images'],
    queryFn: () => (mediaType === 'movie' ? tmdbApi.getMovieImages(mediaId) : tmdbApi.getTVImages(mediaId)),
    enabled: Number.isFinite(mediaId) && mediaId > 0 && !isBlocked,
  });

  useEffect(() => {
    if (isBlocked) {
      return;
    }

    if (isAccountRequired()) {
      setIsBlocked(true);
      router.back();
    }
  }, [isAccountRequired, isBlocked, router]);

  const details = detailsQuery.data;
  const defaultPosterPath = details?.poster_path ?? null;
  const overrideKey = useMemo(
    () => (Number.isFinite(mediaId) ? buildPosterOverrideKey(mediaType, mediaId) : null),
    [mediaId, mediaType]
  );
  const currentOverride = overrideKey ? overrides?.[overrideKey] ?? null : null;

  useEffect(() => {
    if (!details || !overrideKey) {
      return;
    }

    setSelectedPosterPath(currentOverride ?? details.poster_path ?? null);
  }, [currentOverride, details, overrideKey]);

  const activePosterPath = useMemo(
    () =>
      Number.isFinite(mediaId)
        ? resolvePosterPath(mediaType, mediaId, defaultPosterPath)
        : defaultPosterPath,
    [defaultPosterPath, mediaId, mediaType, resolvePosterPath]
  );

  const posterOptions = useMemo(() => {
    const rawPosters = imagesQuery.data?.posters ?? [];
    if (rawPosters.length === 0) {
      return [] as ImageData[];
    }

    const seen = new Set<string>();
    const deduped: ImageData[] = [];

    rawPosters.forEach((poster) => {
      if (!poster.file_path || seen.has(poster.file_path)) {
        return;
      }
      seen.add(poster.file_path);
      deduped.push(poster);
    });

    return deduped;
  }, [imagesQuery.data?.posters]);

  const displayTitle = useMemo(() => {
    if (!details) {
      return mediaType === 'movie' ? t('media.movie') : t('media.tvShow');
    }
    return getDisplayMediaTitle(details, !!preferences?.showOriginalTitles);
  }, [details, mediaType, preferences?.showOriginalTitles, t]);

  const isSaving = setOverrideMutation.isPending || clearOverrideMutation.isPending;
  const hasChanges = selectedPosterPath !== activePosterPath;

  const handleUseDefault = useCallback(() => {
    setSelectedPosterPath(defaultPosterPath);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [defaultPosterPath]);

  const handleSave = useCallback(async () => {
    if (!Number.isFinite(mediaId) || mediaId <= 0 || !details) {
      return;
    }

    try {
      if (!hasChanges) {
        router.back();
        return;
      }

      const shouldClear =
        selectedPosterPath === defaultPosterPath || !selectedPosterPath || selectedPosterPath.length === 0;

      if (shouldClear) {
        await clearOverrideMutation.mutateAsync({ mediaType, mediaId });
        toastRef.current?.show(t('posterPicker.reset'));
      } else {
        await setOverrideMutation.mutateAsync({
          mediaType,
          mediaId,
          posterPath: selectedPosterPath,
        });
        toastRef.current?.show(t('posterPicker.updated'));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error) {
      console.error('[MediaPosterPickerScreen] Failed to save poster override:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toastRef.current?.show(t('posterPicker.failed'));
    }
  }, [
    clearOverrideMutation,
    defaultPosterPath,
    details,
    hasChanges,
    mediaId,
    mediaType,
    router,
    selectedPosterPath,
    setOverrideMutation,
    t,
  ]);

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const renderPosterItem = useCallback(
    ({ item }: { item: ImageData }) => {
      const isSelected = selectedPosterPath === item.file_path;
      const uri = getImageUrl(item.file_path, TMDB_IMAGE_SIZES.poster.medium);

      return (
        <Pressable
          onPress={() => {
            setSelectedPosterPath(item.file_path);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          testID={`poster-picker-option-${item.file_path}`}
          style={[styles.posterCard, isSelected && { borderColor: accentColor }]}
        >
          <MediaImage source={{ uri }} style={styles.posterImage} contentFit="cover" />
          {isSelected && (
            <View style={[styles.selectedBadge, { backgroundColor: accentColor }]}>
              <Check size={12} color={COLORS.white} />
            </View>
          )}
        </Pressable>
      );
    },
    [accentColor, selectedPosterPath]
  );

  if (isBlocked) {
    return null;
  }

  if (detailsQuery.isLoading || imagesQuery.isLoading || !details) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={accentColor} />
      </SafeAreaView>
    );
  }

  if (detailsQuery.isError || imagesQuery.isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <AppErrorState
          error={detailsQuery.error ?? imagesQuery.error}
          message={t('posterPicker.failed')}
          onRetry={() => {
            void detailsQuery.refetch();
            void imagesQuery.refetch();
          }}
          onSecondaryAction={handleBackPress}
          secondaryActionLabel={t('common.goBack')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={handleBackPress}>
          <ArrowLeft size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {mediaType === 'movie' ? t('posterPicker.movieTitle') : t('posterPicker.tvTitle')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.mediaTitle} numberOfLines={2}>
          {displayTitle}
        </Text>
        <Text style={styles.subtitle}>
          {mediaType === 'movie' ? t('posterPicker.subtitleMovie') : t('posterPicker.subtitleTV')}
        </Text>
      </View>

      <Pressable testID="poster-picker-use-default" style={styles.defaultButton} onPress={handleUseDefault}>
        <Text style={[styles.defaultButtonText, { color: accentColor }]}>{t('posterPicker.useDefault')}</Text>
      </Pressable>

      <View style={styles.saveButtonContainer}>
        <Pressable
          style={[
            styles.saveButton,
            styles.saveButtonFullWidth,
            { backgroundColor: accentColor },
            (!hasChanges || isSaving) && styles.disabledButton,
          ]}
          testID="poster-picker-save-button"
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.saveButtonText}>{t('posterPicker.save')}</Text>
          )}
        </Pressable>
      </View>

      {posterOptions.length > 0 ? (
        <FlashList
          data={posterOptions}
          renderItem={renderPosterItem}
          numColumns={3}
          keyExtractor={(item) => item.file_path}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <ImageIcon size={32} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>{t('posterPicker.noPosters')}</Text>
        </View>
      )}

      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.s,
    gap: SPACING.s,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  saveButton: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    minWidth: 88,
    alignItems: 'center',
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  titleBlock: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.s,
  },
  mediaTitle: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  defaultButton: {
    marginHorizontal: SPACING.l,
    marginBottom: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultButtonText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
  },
  saveButtonContainer: {
    marginHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  saveButtonFullWidth: {
    width: '100%',
  },
  gridContent: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  posterCard: {
    flex: 1,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.surfaceLight,
  },
  posterImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  selectedBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: FONT_SIZE.s,
  },
});
