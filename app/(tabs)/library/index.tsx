import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useSegments } from 'expo-router';
import { Bookmark, Settings2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

export default function LibraryScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { data: lists, isLoading } = useLists();
  const [selectedListId, setSelectedListId] = useState<string>('favorites');

  const selectedList = useMemo(() => {
    return lists?.find((l) => l.id === selectedListId);
  }, [lists, selectedListId]);

  const listItems = useMemo(() => {
    if (!selectedList?.items) return [];
    return Object.values(selectedList.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [selectedList]);

  // Auto-switch to favorites if currently selected list is deleted
  useEffect(() => {
    if (lists && !lists.find((l) => l.id === selectedListId)) {
      setSelectedListId('favorites');
    }
  }, [lists, selectedListId]);

  const handleItemPress = (item: ListMediaItem) => {
    const currentTab = segments[1];
    const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

    if (item.media_type === 'movie') {
      router.push(`${basePath}/movie/${item.id}` as any);
    } else {
      router.push(`${basePath}/tv/${item.id}` as any);
    }
  };

  const renderItem = ({ item }: { item: ListMediaItem }) => (
    <TouchableOpacity
      style={styles.mediaCard}
      onPress={() => handleItemPress(item)}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
        style={styles.poster}
        contentFit="cover"
      />
      {item.vote_average > 0 && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Library</Text>
        <TouchableOpacity
          onPress={() => router.push('/manage-lists' as any)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Settings2 size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {lists?.map((list) => (
            <TouchableOpacity
              key={list.id}
              style={[styles.tab, selectedListId === list.id && styles.activeTab]}
              onPress={() => setSelectedListId(list.id)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={[styles.tabText, selectedListId === list.id && styles.activeTabText]}>
                {list.name}
              </Text>
              {list.items && Object.keys(list.items).length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{Object.keys(list.items).length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {listItems.length > 0 ? (
          <FlashList
            data={listItems}
            renderItem={renderItem}
            numColumns={COLUMN_COUNT}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item) => `${item.id}-${item.media_type}`}
            drawDistance={400}
          />
        ) : (
          <View style={styles.emptyState}>
            <Bookmark size={48} color={COLORS.surfaceLight} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyText}>
              Add movies and TV shows to your {selectedList?.name.toLowerCase()} list to see them
              here.
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push('/discover')}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.browseButtonText}>Browse Content</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.m,
  },
  tabsContainer: {
    marginBottom: SPACING.m,
  },
  tabsContent: {
    paddingHorizontal: SPACING.l,
    gap: SPACING.s,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  activeTab: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  activeTabText: {
    color: COLORS.primary,
  },
  countBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingBottom: 100,
  },
  mediaCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.m,
    marginRight: SPACING.m,
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginTop: -50,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  browseButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  browseButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
});
