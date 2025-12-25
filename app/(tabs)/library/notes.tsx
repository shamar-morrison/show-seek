import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import MediaSortModal, {
  NOTES_SCREEN_SORT_OPTIONS,
  SortState,
} from '@/src/components/MediaSortModal';
import NoteModal, { NoteSheetRef } from '@/src/components/NoteModal';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useDeleteNote, useNotes } from '@/src/hooks/useNotes';
import { Note } from '@/src/types/note';
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
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  const weeks = Math.floor(diffDays / 7);
  if (diffDays < 30) {
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }

  const months = Math.floor(diffDays / 30);
  if (diffDays < 365) {
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(diffDays / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
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
  const { data: notes, isLoading } = useNotes();
  const deleteNoteMutation = useDeleteNote();
  const noteSheetRef = useRef<NoteSheetRef>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
          const titleA = a.mediaTitle.toLowerCase();
          const titleB = b.mediaTitle.toLowerCase();
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
      navigation.setOptions({
        headerTitle: () => null,
        headerRight: () => null,
        header: () => (
          <SearchableHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={deactivateSearch}
            placeholder="Search notes..."
          />
        ),
      });
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
              <View style={styles.sortIconWrapper}>
                <ArrowUpDown size={22} color={COLORS.text} />
                {hasActiveSort && <View style={styles.sortBadge} />}
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
  ]);

  // Group notes by media type (uses search-filtered notes)
  const groupedNotes = useMemo(() => {
    if (!displayNotes || viewMode === 'list') return null;

    const movieNotes = displayNotes.filter((n) => n.mediaType === 'movie');
    const tvNotes = displayNotes.filter((n) => n.mediaType === 'tv');

    const sections: NoteSection[] = [];
    if (movieNotes.length > 0) {
      sections.push({ title: 'Movies', data: movieNotes });
    }
    if (tvNotes.length > 0) {
      sections.push({ title: 'TV Shows', data: tvNotes });
    }

    return sections;
  }, [displayNotes, viewMode]);

  const handleCardPress = useCallback(
    (note: Note) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate: currentTab is null');
        return;
      }

      const mediaPath = note.mediaType === 'movie' ? 'movie' : 'tv';
      const path = `/(tabs)/${currentTab}/${mediaPath}/${note.mediaId}`;
      router.push(path as any);
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
    });
  }, []);

  const handleDeleteNote = useCallback(
    async (note: Note) => {
      Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNoteMutation.mutateAsync({
                mediaType: note.mediaType,
                mediaId: note.mediaId,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]);
    },
    [deleteNoteMutation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Note }) => {
      const posterUrl = getImageUrl(item.posterPath, TMDB_IMAGE_SIZES.poster.small);

      return (
        <Pressable
          style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
          onPress={() => handleCardPress(item)}
        >
          <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          <View style={styles.noteContent}>
            <Text style={styles.mediaTitle} numberOfLines={1}>
              {item.mediaTitle}
            </Text>
            <Text style={styles.noteText} numberOfLines={2}>
              {truncateText(item.content, 80)}
            </Text>
            <Text style={styles.timestamp}>{formatRelativeTime(item.updatedAt)}</Text>
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
    [handleCardPress, handleEditNote, handleDeleteNote, deleteNoteMutation.isPending]
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
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <View style={styles.premiumGate}>
          <StickyNote size={60} color={COLORS.textSecondary} />
          <Text style={styles.premiumTitle}>Premium Feature</Text>
          <Text style={styles.premiumDescription}>
            Notes are a premium feature. Upgrade to unlock and add personal notes to your movies and
            TV shows.
          </Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/premium' as any)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Empty state
  if (!notes || notes.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={StickyNote}
          title="No Notes Yet"
          description="Add notes to movies and TV shows from their detail pages."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      {viewMode === 'list' ? (
        <FlashList
          data={displayNotes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try a different search term."
                />
              </View>
            ) : null
          }
        />
      ) : (
        <SectionList
          sections={groupedNotes || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
          SectionSeparatorComponent={SectionSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try a different search term."
                />
              </View>
            ) : null
          }
        />
      )}
      <NoteModal ref={noteSheetRef} />
      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={NOTES_SCREEN_SORT_OPTIONS}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
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
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  noteCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  noteContent: {
    flex: 1,
    gap: SPACING.xs,
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
  sortIconWrapper: {
    position: 'relative',
  },
  sortBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
