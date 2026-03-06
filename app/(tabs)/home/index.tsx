import type { Movie, TVShow } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { HomeDrawer } from '@/src/components/HomeDrawer';
import { HomeListSection } from '@/src/components/HomeListSection';
import HomeScreenCustomizationModal, {
  HomeScreenCustomizationModalRef,
} from '@/src/components/HomeScreenCustomizationModal';
import { HomeListSectionSkeleton } from '@/src/components/skeletons/HomeListSectionSkeleton';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useLists } from '@/src/hooks/useLists';
import { usePreferences, useUpdateHomeScreenLists } from '@/src/hooks/usePreferences';
import { ListMediaItem } from '@/src/services/ListService';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  areHomeScreenSelectionsEqual,
  normalizeHomeScreenSelections,
} from '@/src/utils/homeScreenSelections';
import { filterCustomLists } from '@/src/constants/lists';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Menu, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const modalRef = useRef<HomeScreenCustomizationModalRef>(null);
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const lastRepairSignatureRef = useRef<string | null>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { preferences, homeScreenLists, isLoading: isLoadingPreferences } = usePreferences();
  const { data: userLists, isLoading: isLoadingLists, isError: isListsError } = useLists({
    enabled: !!user,
  });
  const repairHomeScreenLists = useUpdateHomeScreenLists();
  const isAccountRequired = useAccountRequired();
  const { isPremium } = usePremium();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const storedHomeScreenLists = preferences.homeScreenLists;
  const hasCustomSelections = storedHomeScreenLists?.some((item) => item.type === 'custom') ?? false;
  const customLists = useMemo(() => filterCustomLists(userLists), [userLists]);
  const resolvedHomeScreenLists = useMemo(() => {
    if (hasCustomSelections && (isLoadingLists || isListsError)) {
      return homeScreenLists;
    }

    return normalizeHomeScreenSelections(storedHomeScreenLists, customLists);
  }, [
    customLists,
    hasCustomSelections,
    homeScreenLists,
    isListsError,
    isLoadingLists,
    storedHomeScreenLists,
  ]);

  // Check if user can access Latest Trailers (signed in + premium)
  const canAccessTrailers = useMemo(() => {
    return !!user && isPremium;
  }, [user, isPremium]);

  // Check if we need to show Top Rated at the end for users without trailer access.
  const showTopRatedAtEnd = useMemo(() => {
    return (
      !canAccessTrailers &&
      resolvedHomeScreenLists.some((config) => config.id === 'latest-trailers')
    );
  }, [canAccessTrailers, resolvedHomeScreenLists]);

  const isLoadingHomeSelections =
    !!user && (isLoadingPreferences || (hasCustomSelections && isLoadingLists));

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trending'] }),
      queryClient.invalidateQueries({ queryKey: ['popular'] }),
      queryClient.invalidateQueries({ queryKey: ['topRated'] }),
      queryClient.invalidateQueries({ queryKey: ['upcoming'] }),
      queryClient.invalidateQueries({ queryKey: ['latest-trailers'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  const handleMediaLongPress = useCallback(
    (item: Movie | TVShow, mediaType: 'movie' | 'tv') => {
      if (isAccountRequired()) return;

      const title = mediaType === 'movie' ? (item as Movie).title : (item as TVShow).name || '';
      const name = mediaType === 'tv' ? (item as TVShow).name : undefined;
      const releaseDate =
        mediaType === 'movie'
          ? (item as Movie).release_date || ''
          : (item as TVShow).first_air_date || '';
      const firstAirDate = mediaType === 'tv' ? (item as TVShow).first_air_date : undefined;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelectedMediaItem({
        id: item.id,
        media_type: mediaType,
        title,
        name,
        poster_path: item.poster_path,
        vote_average: item.vote_average || 0,
        release_date: releaseDate,
        first_air_date: firstAirDate,
        genre_ids: item.genre_ids,
      });
    },
    [isAccountRequired]
  );

  useEffect(() => {
    if (selectedMediaItem) {
      void addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const { isPending: isRepairPending, mutate: mutateHomeScreenLists } = repairHomeScreenLists;

  useEffect(() => {
    if (!user || !storedHomeScreenLists) {
      lastRepairSignatureRef.current = null;
      return;
    }

    if (
      isLoadingPreferences ||
      isRepairPending ||
      isListsError ||
      (hasCustomSelections && isLoadingLists)
    ) {
      return;
    }

    if (areHomeScreenSelectionsEqual(storedHomeScreenLists, resolvedHomeScreenLists)) {
      lastRepairSignatureRef.current = null;
      return;
    }

    const repairSignature = JSON.stringify({
      stored: storedHomeScreenLists,
      resolved: resolvedHomeScreenLists,
    });

    if (lastRepairSignatureRef.current === repairSignature) {
      return;
    }

    lastRepairSignatureRef.current = repairSignature;
    mutateHomeScreenLists(resolvedHomeScreenLists, {
      onError: () => {
        lastRepairSignatureRef.current = null;
      },
    });
  }, [
    hasCustomSelections,
    isRepairPending,
    isListsError,
    isLoadingLists,
    isLoadingPreferences,
    mutateHomeScreenLists,
    resolvedHomeScreenLists,
    storedHomeScreenLists,
    user,
  ]);

  const handleOpenCustomization = () => {
    if (isAccountRequired()) return;
    modalRef.current?.present();
  };

  const handleOpenDrawer = () => {
    setDrawerVisible(true);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <HeaderIconButton onPress={handleOpenDrawer}>
          <Menu size={24} color={COLORS.text} />
        </HeaderIconButton>
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Text style={[styles.headerTitle, { color: accentColor }]}>{t('common.appName')}</Text>
        </View>
        <HeaderIconButton onPress={handleOpenCustomization}>
          <Settings2 size={24} color={COLORS.text} />
        </HeaderIconButton>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >
        {/* Show skeleton sections while preferences are loading for signed-in users */}
        {/* This prevents layout shift when user's customized list loads */}
        {isLoadingHomeSelections ? (
          <>
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
          </>
        ) : (
          <>
            {resolvedHomeScreenLists.map((config) => (
              <HomeListSection
                key={config.id}
                config={config}
                onMediaLongPress={handleMediaLongPress}
              />
            ))}

            {/* Show Top Rated at the end when Latest Trailers is unavailable */}
            {showTopRatedAtEnd && (
              <HomeListSection
                config={{ id: 'top-rated-movies', type: 'tmdb', label: t('home.topRated') }}
                onMediaLongPress={handleMediaLongPress}
              />
            )}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <HomeScreenCustomizationModal
        ref={modalRef}
        onShowToast={handleShowToast}
        resolvedHomeScreenLists={resolvedHomeScreenLists}
        customLists={customLists}
      />
      <HomeDrawer visible={drawerVisible} onClose={handleCloseDrawer} />
      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
          onDismiss={() => setSelectedMediaItem(null)}
        />
      )}
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    letterSpacing: -1.5,
  },
  scrollView: {
    flex: 1,
  },
});
