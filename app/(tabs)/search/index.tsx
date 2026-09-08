import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import {
  SEARCH_TABS,
  SearchMediaType,
  SearchResultsPage,
  SearchViewMode,
} from '@/src/components/search/SearchResultsPage';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import {
  SwipeableTabPager,
  SwipeableTabPagerRef,
} from '@/src/components/ui/SwipeableTabPager';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import type { ListMediaItem } from '@/src/services/ListService';
import { screenStyles } from '@/src/styles/screenStyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Grid3X3, List, Search as SearchIcon, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SEARCH_VIEW_MODE_STORAGE_KEY = 'searchViewMode';

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mediaType, setMediaType] = useState<SearchMediaType>('all');
  const [viewMode, setViewMode] = useState<SearchViewMode>('list');
  const { t } = useTranslation();

  const pagerRef = useRef<SwipeableTabPagerRef>(null);

  // Long-press to add to list
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const savedViewMode = await AsyncStorage.getItem(SEARCH_VIEW_MODE_STORAGE_KEY);
        if (savedViewMode === 'list' || savedViewMode === 'grid') {
          setViewMode(savedViewMode);
        }
      } catch (error) {
        console.error('Failed to load search view mode preference:', error);
      }
    };

    void loadViewMode();
  }, []);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextViewMode: SearchViewMode = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(nextViewMode);

    try {
      await AsyncStorage.setItem(SEARCH_VIEW_MODE_STORAGE_KEY, nextViewMode);
    } catch (error) {
      console.error('Failed to save search view mode preference:', error);
    }
  }, [viewMode]);

  // Pill taps drive both state and pager; swipe settles report back via onChange.
  const handleTabChange = useCallback((next: SearchMediaType) => {
    setMediaType(next);
    pagerRef.current?.goToKey(next);
  }, []);

  // Stable across keystrokes (keyed by debounced value) so pages don't
  // re-render on every character typed.
  const renderSearchPage = useCallback(
    (key: SearchMediaType, isActive: boolean) => (
      <SearchResultsPage
        mediaType={key}
        debouncedQuery={debouncedQuery}
        isActive={isActive}
        viewMode={viewMode}
        onLongPressMediaItem={setSelectedMediaItem}
      />
    ),
    [debouncedQuery, viewMode]
  );

  // Present the modal when an item is selected
  // This uses useEffect to ensure the modal is mounted (if conditionally rendered)
  // before we try to present it
  useEffect(() => {
    if (selectedMediaItem) {
      addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const handleShowToast = (message: string) => {
    toastRef.current?.show(message);
  };

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('tabs.search')}</Text>
          <View style={styles.headerActions}>
            <HeaderIconButton onPress={toggleViewMode}>
              {viewMode === 'list' ? (
                <Grid3X3 size={24} color={COLORS.text} />
              ) : (
                <List size={24} color={COLORS.text} />
              )}
            </HeaderIconButton>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <SearchIcon size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('search.placeholder')}
              placeholderTextColor={COLORS.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={HIT_SLOP.l}
                activeOpacity={ACTIVE_OPACITY}
              >
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.segmentedControlContainer}>
          <SegmentedControl<SearchMediaType>
            options={[
              { key: 'all', label: t('search.all') },
              { key: 'movie', label: t('media.movies') },
              { key: 'tv', label: t('media.tvShows') },
            ]}
            activeKey={mediaType}
            onChange={handleTabChange}
            testID="search-media-filter"
          />
        </View>

        {debouncedQuery.length === 0 ? (
          <View style={styles.centerContainer}>
            <SearchIcon size={64} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>{t('search.prompt')}</Text>
          </View>
        ) : (
          <SwipeableTabPager<SearchMediaType>
            ref={pagerRef}
            tabs={SEARCH_TABS}
            activeKey={mediaType}
            onChange={setMediaType}
            renderPage={renderSearchPage}
            testID="search-tab-pager"
          />
        )}
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}
      <Toast ref={toastRef} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.m,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  segmentedControlContainer: {
    padding: SPACING.m,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
  },
});
