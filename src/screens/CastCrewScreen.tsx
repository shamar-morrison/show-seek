import { CastMember, tmdbApi } from '@/src/api/tmdb';
import { PersonCard } from '@/src/components/library/PersonCard';
import { PersonListCard } from '@/src/components/library/PersonListCard';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import {
  type PersonFavoriteTarget,
  usePersonFavoriteSheet,
} from '@/src/hooks/usePersonFavoriteSheet';
import ListActionsModal from '@/src/components/ListActionsModal';
import { screenStyles } from '@/src/styles/screenStyles';
import { mergeCrewMembersByPerson } from '@/src/utils/credits';
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { FlashList, FlashListRef, ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowLeft01Icon, GridIcon, Menu01Icon } from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'cast' | 'crew';

interface CastCrewScreenProps {
  id: number;
  type: 'movie' | 'tv';
  mediaTitle?: string;
}

interface DisplayCreditItem {
  key: string;
  id: number;
  name: string;
  role: string;
  profilePath: string | null;
}

const displayItemToPerson = (item: DisplayCreditItem) => ({
  id: item.id,
  name: item.name,
  profile_path: item.profilePath,
  known_for_department: '',
});

export default function CastCrewScreen({ id, type, mediaTitle }: CastCrewScreenProps) {
  const router = useRouter();
  const segments = useSegments();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [activeTab, setActiveTab] = useState<TabType>('cast');
  const listRef = useRef<FlashListRef<DisplayCreditItem> | null>(null);
  const scrollOffsetsRef = useRef<Record<string, number>>({});
  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } =
    getThreeColumnGridMetrics(windowWidth);

  const { viewMode, isLoadingPreference, toggleViewMode } = useViewModeToggle({
    storageKey: `cast-crew-view-${type}`,
    showSortButton: false,
    manageHeader: false,
  });

  const creditsQuery = useQuery({
    queryKey: [type, id, 'credits'],
    queryFn: () => (type === 'movie' ? tmdbApi.getMovieCredits(id) : tmdbApi.getTVCredits(id)),
    enabled: !!id,
  });

  const handlePersonPress = useCallback(
    (personId: number) => {
      const currentTab = segments[1];
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}/person/${personId}` as any);
      } else {
        router.push(`/person/${personId}` as any);
      }
    },
    [router, segments]
  );

  const {
    sheetRef: personSheetRef,
    actions: personSheetActions,
    handlePersonLongPress,
  } = usePersonFavoriteSheet();

  const handleCreditLongPress = useCallback(
    (person: PersonFavoriteTarget) => {
      handlePersonLongPress(person);
    },
    [handlePersonLongPress]
  );

  const castItems = useMemo<DisplayCreditItem[]>(() => {
    if (!creditsQuery.data?.cast) {
      return [];
    }

    return creditsQuery.data.cast.map((member: CastMember) => ({
      key: `${member.id}-${member.order}-${member.character}`,
      id: member.id,
      name: member.name,
      role: member.character,
      profilePath: member.profile_path,
    }));
  }, [creditsQuery.data?.cast]);

  const crewItems = useMemo<DisplayCreditItem[]>(() => {
    if (!creditsQuery.data?.crew) {
      return [];
    }

    return mergeCrewMembersByPerson(creditsQuery.data.crew).map((member) => ({
      key: `${member.id}`,
      id: member.id,
      name: member.name,
      role: member.job,
      profilePath: member.profile_path,
    }));
  }, [creditsQuery.data?.crew]);

  const activeData = useMemo(
    () => (activeTab === 'cast' ? castItems : crewItems),
    [activeTab, castItems, crewItems]
  );

  const activeListKey = useMemo(() => `${activeTab}:${viewMode}`, [activeTab, viewMode]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetsRef.current[activeListKey] = event.nativeEvent.contentOffset.y;
    },
    [activeListKey]
  );

  useEffect(() => {
    const nextOffset = scrollOffsetsRef.current[activeListKey] ?? 0;
    const frameId = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeData.length, activeListKey]);

  const handleCastTabPress = useCallback(() => {
    setActiveTab((current) => (current === 'cast' ? current : 'cast'));
  }, []);

  const handleCrewTabPress = useCallback(() => {
    setActiveTab((current) => (current === 'crew' ? current : 'crew'));
  }, []);

  const renderGridItem = useCallback(
    ({ item }: ListRenderItemInfo<DisplayCreditItem>) => {
      return (
        <View style={[styles.gridCard, { marginHorizontal: itemHorizontalMargin }]}>
          <PersonCard
            person={displayItemToPerson(item)}
            width={itemWidth}
            subtitle={item.role}
            transparent
            onPress={handlePersonPress}
            onLongPress={handleCreditLongPress}
          />
        </View>
      );
    },
    [handlePersonPress, handleCreditLongPress, itemHorizontalMargin, itemWidth]
  );

  const renderListItem = useCallback(
    ({ item }: ListRenderItemInfo<DisplayCreditItem>) => (
      <View style={styles.listCard}>
        <PersonListCard
          person={displayItemToPerson(item)}
          subtitle={item.role}
          onPress={handlePersonPress}
          onLongPress={handleCreditLongPress}
        />
      </View>
    ),
    [handlePersonPress, handleCreditLongPress]
  );

  const keyExtractor = useCallback((item: DisplayCreditItem) => item.key, []);

  if (creditsQuery.isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (creditsQuery.isError || !creditsQuery.data) {
    return (
      <AppErrorState
        error={creditsQuery.error}
        message={t('credits.failedToLoad')}
        onRetry={() => {
          void creditsQuery.refetch();
        }}
        onSecondaryAction={() => router.back()}
        secondaryActionLabel={t('common.goBack')}
        accentColor={accentColor}
      />
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
        >
          <AppIcon icon={ArrowLeft01Icon} size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('media.castAndCrew')}</Text>
          {mediaTitle && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {mediaTitle}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <HeaderIconButton onPress={toggleViewMode}>
            {viewMode === 'grid' ? (
              <AppIcon icon={Menu01Icon} size={24} color={COLORS.text} />
            ) : (
              <AppIcon icon={GridIcon} size={24} color={COLORS.text} />
            )}
          </HeaderIconButton>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'cast' && [styles.activeTab, { backgroundColor: accentColor }],
          ]}
          onPress={handleCastTabPress}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.tabText, activeTab === 'cast' && styles.activeTabText]}>
            {t('media.cast')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'crew' && [styles.activeTab, { backgroundColor: accentColor }],
          ]}
          onPress={handleCrewTabPress}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.tabText, activeTab === 'crew' && styles.activeTabText]}>
            {t('media.crew')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlashList
        ref={listRef}
        key={viewMode}
        data={activeData}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={
          viewMode === 'grid'
            ? [styles.gridContent, { paddingHorizontal: listPaddingHorizontal }]
            : styles.listContent
        }
        numColumns={viewMode === 'grid' ? GRID_COLUMN_COUNT : 1}
        drawDistance={400}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
      <ListActionsModal ref={personSheetRef} actions={personSheetActions} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerButton: {
    padding: SPACING.s,
    marginRight: SPACING.s,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  activeTab: {},
  tabText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
  },
  gridContent: {
    paddingTop: SPACING.m,
    paddingBottom: SPACING.s,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  gridCard: {
    marginBottom: SPACING.m,
  },
  listCard: {
    marginBottom: SPACING.m,
  },
});
