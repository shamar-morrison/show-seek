import { CastMember, CrewMember, getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Grid3X3, List } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'cast' | 'crew';

interface CastCrewScreenProps {
  id: number;
  type: 'movie' | 'tv';
  mediaTitle?: string;
}

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

export default function CastCrewScreen({ id, type, mediaTitle }: CastCrewScreenProps) {
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [activeTab, setActiveTab] = useState<TabType>('cast');
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

  const handlePersonPress = (personId: number) => {
    const currentTab = segments[1];
    if (currentTab) {
      router.push(`/(tabs)/${currentTab}/person/${personId}` as any);
    } else {
      router.push(`/person/${personId}` as any);
    }
  };

  const renderGridItem = ({ item }: { item: CastMember | CrewMember }) => {
    const isCast = 'character' in item;
    const role = isCast ? (item as CastMember).character : (item as CrewMember).job;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePersonPress(item.id)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
          style={styles.profileImage}
          contentFit="cover"
          placeholderType="person"
        />
        <View style={styles.cardInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {role}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: CastMember | CrewMember }) => {
    const isCast = 'character' in item;
    const role = isCast ? (item as CastMember).character : (item as CrewMember).job;

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          styles.listCard,
          pressed && listCardStyles.containerPressed,
        ]}
        onPress={() => handlePersonPress(item.id)}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.profile_path, TMDB_IMAGE_SIZES.profile.medium) }}
          style={listCardStyles.poster}
          contentFit="cover"
          placeholderType="person"
        />
        <View style={listCardStyles.info}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.listRole} numberOfLines={1}>
            {role}
          </Text>
        </View>
      </Pressable>
    );
  };

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

  const data = activeTab === 'cast' ? creditsQuery.data.cast : creditsQuery.data.crew;

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
          onPress={() => setActiveTab('cast')}
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
          onPress={() => setActiveTab('crew')}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.tabText, activeTab === 'crew' && styles.activeTabText]}>
            {t('media.crew')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        key={viewMode}
        data={data}
        renderItem={viewMode === 'grid' ? renderGridItem : renderListItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={viewMode === 'grid' ? styles.gridContent : styles.listContent}
        numColumns={viewMode === 'grid' ? COLUMN_COUNT : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.columnWrapper : undefined}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backButton: {
    padding: SPACING.m,
  },
  backButtonText: {
  },
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
  activeTab: {
  },
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
  columnWrapper: {
    gap: SPACING.m,
    marginBottom: SPACING.m,
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
