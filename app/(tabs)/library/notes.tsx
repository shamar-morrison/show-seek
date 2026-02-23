import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { NOTES_SCREEN_SORT_OPTIONS, SortState } from '@/src/components/MediaSortModal';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HEADER_CHROME_HEIGHT,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useDeleteNote, useNotes } from '@/src/hooks/useNotes';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { Note } from '@/src/types/note';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import { getSortableTitle } from '@/src/utils/sortUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import {
  ArrowUpDown,
  Grid3X3,
  List,
  Pencil,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ViewMode = 'list' | 'grouped';
type NoteSection = {
  title: string;
  data: Note[];
};

const VIEW_MODE_STORAGE_KEY = 'notesViewMode';
const SORT_STATE_STORAGE_KEY = 'notesSortState';

const DEFAULT_SORT_STATE: SortState = {
  option: 'dateAdded',
  direction: 'desc',
};

/**
 * Format relative time (e.g., "2 days ago")
 */
function formatRelativeTime(
  date: Date,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  // Clamp to non-negative to handle future timestamps (treat as "today")
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) return t('common.today');
  if (diffDays === 1) return t('common.yesterday');

  if (diffDays < 7) {
    return t('relativeTime.daysAgo', { count: diffDays });
  }

  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) {
    return t('relativeTime.weeksAgo', { count: weeks });
  }

  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) {
    return t('relativeTime.monthsAgo', { count: months });
  }

  const years = Math.floor(diffDays / 365);
  return t('relativeTime.yearsAgo', { count: years });
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export default function NotesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { isPremium } = usePremium();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const iconBadgeStyles = useIconBadgeStyles();
  const { data: notes, isLoading, error, refetch } = useNotes();
  const deleteNoteMutation = useDeleteNote();
  const noteSheetRef = useRef<NoteModalRef>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const { resolvePosterPath } = usePosterOverrides();

  // Calculate tab bar height (matches _layout.tsx)
  const hideLabels = preferences?.hideTabLabels ?? false;
  const TAB_BAR_HEIGHT = hideLabels ? 56 : 70;

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [savedViewMode, savedSortState] = await Promise.all([
          AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY),
          AsyncStorage.getItem(SORT_STATE_STORAGE_KEY),
        ]);
        if (savedViewMode === 'list' || savedViewMode === 'grouped') {
          setViewMode(savedViewMode);
        }
        if (savedSortState) {
          const parsed = JSON.parse(savedSortState);
          setSortState(parsed);
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreferences();
  }, []);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'list' ? 'grouped' : 'list';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

  const handleApplySort = useCallback(async (newSortState: SortState) => {
    setSortState(newSortState);
    try {
      await AsyncStorage.setItem(SORT_STATE_STORAGE_KEY, JSON.stringify(newSortState));
    } catch (error) {
      console.error('Failed to save sort preference:', error);
    }
  }, []);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  // Sort notes
  const sortedNotes = useMemo(() => {
    if (!notes) return [];
    return [...notes].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'dateAdded':
          return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
        case 'lastUpdated':
          return (a.updatedAt.getTime() - b.updatedAt.getTime()) * direction;
        case 'alphabetical': {
          const titleA = getSortableTitle(a.mediaTitle);
          const titleB = getSortableTitle(b.mediaTitle);
          return titleA.localeCompare(titleB) * direction;
        }
        default:
          return 0;
      }
    });
  }, [notes, sortState]);

  // Search functionality - search by note content and media title
  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayNotes,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: sortedNotes,
    getSearchableText: (note) => `${note.content} ${note.mediaTitle}`,
  });

  // Set up header buttons
  useLayoutEffect(() => {
    if (!isPremium) return;

    if (isSearchActive) {
      // Show search header
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('notes.searchPlaceholder'),
        })
      );
    } else {
      // Show normal header with buttons
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            {/* Search button */}
            <HeaderIconButton onPress={searchButton.onPress}>
              <Search size={22} color={COLORS.text} />
            </HeaderIconButton>
            {/* Sort button */}
            <HeaderIconButton onPress={() => setSortModalVisible(true)}>
              <View style={iconBadgeStyles.wrapper}>
                <ArrowUpDown size={22} color={COLORS.text} />
                {hasActiveSort && <View style={iconBadgeStyles.badge} />}
              </View>
            </HeaderIconButton>
            {/* View mode button */}
            <HeaderIconButton onPress={toggleViewMode}>
              {viewMode === 'list' ? (
                <Grid3X3 size={22} color={COLORS.text} />
              ) : (
                <List size={22} color={COLORS.text} />
              )}
            </HeaderIconButton>
          </View>
        ),
      });
    }
  }, [
    navigation,
    isPremium,
    viewMode,
    toggleViewMode,
    hasActiveSort,
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    t,
  ]);

  // Group notes by media type (uses search-filtered notes)
  const groupedNotes = useMemo(() => {
    if (!displayNotes || viewMode === 'list') return null;

    const movieNotes = displayNotes.filter((n) => n.mediaType === 'movie');
    const tvNotes = displayNotes.filter((n) => n.mediaType === 'tv');
    const episodeNotes = displayNotes.filter((n) => n.mediaType === 'episode');

    const sections: NoteSection[] = [];
    if (movieNotes.length > 0) {
      sections.push({ title: t('media.movies'), data: movieNotes });
    }
    if (tvNotes.length > 0) {
      sections.push({ title: t('media.tvShows'), data: tvNotes });
    }
    if (episodeNotes.length > 0) {
      sections.push({ title: t('media.episodes'), data: episodeNotes });
    }

    return sections;
  }, [displayNotes, viewMode, t]);

  const handleCardPress = useCallback(
    (note: Note) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate: currentTab is null');
        return;
      }

      if (note.mediaType === 'episode') {
        // Navigate to episode detail screen
        const path = `/(tabs)/${currentTab}/tv/${note.showId}/season/${note.seasonNumber}/episode/${note.episodeNumber}`;
        router.push(path as any);
      } else {
        // Navigate to movie or TV show detail screen
        const mediaPath = note.mediaType === 'movie' ? 'movie' : 'tv';
        const path = `/(tabs)/${currentTab}/${mediaPath}/${note.mediaId}`;
        router.push(path as any);
      }
    },
    [currentTab, router]
  );

  const handleEditNote = useCallback((note: Note) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    noteSheetRef.current?.present({
      mediaType: note.mediaType,
      mediaId: note.mediaId,
      posterPath: note.posterPath,
      mediaTitle: note.mediaTitle,
      initialNote: note.content,
      seasonNumber: note.seasonNumber,
      episodeNumber: note.episodeNumber,
      showId: note.showId,
    });
  }, []);

  const handleDeleteNote = useCallback(
    async (note: Note) => {
      Alert.alert(t('notes.deleteNote'), t('notes.confirmDeleteNote'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoteMutation.mutateAsync({
                mediaType: note.mediaType,
                mediaId: note.mediaId,
                seasonNumber: note.seasonNumber,
                episodeNumber: note.episodeNumber,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert(t('common.error'), t('errors.deleteFailed'));
            }
          },
        },
      ]);
    },
    [deleteNoteMutation, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const resolvedPosterPath =
        item.mediaType === 'episode' && item.showId
          ? resolvePosterPath('tv', item.showId, item.posterPath)
          : item.mediaType === 'movie' || item.mediaType === 'tv'
            ? resolvePosterPath(item.mediaType, item.mediaId, item.posterPath)
            : item.posterPath;
      const posterUrl = getImageUrl(resolvedPosterPath, TMDB_IMAGE_SIZES.poster.small);

      return (
        <Pressable
          style={({ pressed }) => [
            listCardStyles.container,
            pressed && listCardStyles.containerPressed,
          ]}
          onPress={() => handleCardPress(item)}
        >
          <MediaImage
            source={{ uri: posterUrl }}
            style={listCardStyles.poster}
            contentFit="cover"
          />
          <View style={listCardStyles.info}>
            <Text style={styles.mediaTitle} numberOfLines={1}>
              {item.mediaTitle}
            </Text>
            <Text style={styles.noteText} numberOfLines={2}>
              {truncateText(item.content, 80)}
            </Text>
            <Text style={styles.timestamp}>{formatRelativeTime(item.updatedAt, t)}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => handleEditNote(item)}
              style={styles.actionButton}
              hitSlop={HIT_SLOP.m}
            >
              <Pencil size={20} color={COLORS.text} />
            </Pressable>
            <Pressable
              onPress={() => handleDeleteNote(item)}
              style={styles.actionButton}
              hitSlop={HIT_SLOP.m}
              disabled={deleteNoteMutation.isPending}
            >
              {deleteNoteMutation.isPending ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <Trash2 size={20} color={COLORS.error} />
              )}
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [
      deleteNoteMutation.isPending,
      handleCardPress,
      handleDeleteNote,
      handleEditNote,
      resolvePosterPath,
    ]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: NoteSection }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);
  const SectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);

  // Premium gate
  if (!isPremium) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <View style={styles.premiumGate}>
          <StickyNote size={60} color={COLORS.textSecondary} />
          <Text style={styles.premiumTitle}>{t('premiumFeature.title')}</Text>
          <Text style={styles.premiumDescription}>{t('notes.premiumDescription')}</Text>
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: accentColor }]}
            onPress={() => router.push('/premium' as any)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.upgradeButtonText}>{t('profile.upgradeToPremium')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (error) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  // Empty state
  if (!notes || notes.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={StickyNote}
          title={t('library.emptyNotes')}
          description={t('library.emptyNotesHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      {viewMode === 'list' ? (
        <FlashList
          data={displayNotes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <SearchEmptyState
                height={
                  windowHeight - insets.top - insets.bottom - HEADER_CHROME_HEIGHT - TAB_BAR_HEIGHT
                }
              />
            ) : null
          }
        />
      ) : (
        <SectionList
          sections={groupedNotes || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
          SectionSeparatorComponent={SectionSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <SearchEmptyState
                height={
                  windowHeight - insets.top - insets.bottom - HEADER_CHROME_HEIGHT - TAB_BAR_HEIGHT
                }
              />
            ) : null
          }
        />
      )}
      <NoteModal ref={noteSheetRef} />
      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={NOTES_SCREEN_SORT_OPTIONS}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: SPACING.m,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.s,
  },
  sectionSeparator: {
    height: SPACING.l,
  },
  mediaTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  noteText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  timestamp: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'column',
    gap: SPACING.m,
  },
  actionButton: {
    padding: SPACING.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Premium gate styles
  premiumGate: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  premiumTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.l,
    marginBottom: SPACING.s,
  },
  premiumDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  upgradeButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
});
