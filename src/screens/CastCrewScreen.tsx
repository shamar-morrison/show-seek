import { CastMember, getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { mergeCrewMembersByPerson } from '@/src/utils/credits';
import { FlashList, FlashListRef, ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Grid3X3, List } from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
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

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const GridCreditCard = memo<{
  item: DisplayCreditItem;
  onPress: (personId: number) => void;
  style?: StyleProp<ViewStyle>;
}>(({ item, onPress, style }) => {
  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.profilePath, TMDB_IMAGE_SIZES.profile.medium) }}
        style={styles.profileImage}
        contentFit="cover"
        placeholderType="person"
      />
      <View style={styles.cardInfo}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.role} numberOfLines={1}>
          {item.role}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

GridCreditCard.displayName = 'GridCreditCard';

const ListCreditCard = memo<{
  item: DisplayCreditItem;
  onPress: (personId: number) => void;
}>(({ item, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        listCardStyles.container,
        styles.listCard,
        pressed && listCardStyles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.profilePath, TMDB_IMAGE_SIZES.profile.medium) }}
        style={listCardStyles.poster}
        contentFit="cover"
        placeholderType="person"
      />
      <View style={listCardStyles.info}>
        <Text style={styles.listName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.listRole} numberOfLines={1}>
          {item.role}
        </Text>
      </View>
    </Pressable>
  );
});

ListCreditCard.displayName = 'ListCreditCard';

export default function CastCrewScreen({ id, type, mediaTitle }: CastCrewScreenProps) {
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [activeTab, setActiveTab] = useState<TabType>('cast');
  const listRef = useRef<FlashListRef<DisplayCreditItem> | null>(null);
  const scrollOffsetsRef = useRef<Record<string, number>>({});

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
    ({ item, index }: ListRenderItemInfo<DisplayCreditItem>) => {
      const isLastColumn = (index + 1) % COLUMN_COUNT === 0;
      return (
        <GridCreditCard
          item={item}
          onPress={handlePersonPress}
          style={[styles.gridCard, !isLastColumn && styles.gridCardWithRightMargin]}
        />
      );
    },
    [handlePersonPress]
  );

  const renderListItem = useCallback(
    ({ item }: ListRenderItemInfo<DisplayCreditItem>) => (
      <ListCreditCard item={item} onPress={handlePersonPress} />
    ),
    [handlePersonPress]
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
          <ArrowLeft size={24} color={COLORS.text} />
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
              <List size={24} color={COLORS.text} />
            ) : (
              <Grid3X3 size={24} color={COLORS.text} />
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
        contentContainerStyle={viewMode === 'grid' ? styles.gridContent : styles.listContent}
        numColumns={viewMode === 'grid' ? COLUMN_COUNT : 1}
        drawDistance={400}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
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
    fontWeight: 'bold',
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
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
  },
  gridContent: {
    paddingHorizontal: SPACING.l,
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
  gridCardWithRightMargin: {
    marginRight: SPACING.m,
  },
  card: {
    width: ITEM_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: COLORS.surfaceLight,
  },
  cardInfo: {
    padding: SPACING.s,
  },
  name: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  role: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  listCard: {
    marginBottom: SPACING.m,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  listRole: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
