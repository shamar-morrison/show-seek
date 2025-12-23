import { EmptyState } from '@/src/components/library/EmptyState';
import MediaSortModal, { SortOption, SortState } from '@/src/components/MediaSortModal';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
import { ACTIVE_OPACITY, COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';
import { InProgressShow } from '@/src/types/episodeTracking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, TvIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = 'watchProgressSortState';
const ALLOWED_SORT_OPTIONS: SortOption[] = ['progress', 'alphabetical', 'lastWatched'];

const DEFAULT_SORT_STATE: SortState = {
  option: 'lastWatched',
  direction: 'desc',
};

export default function WatchProgressScreen() {
  const navigation = useNavigation();
  const { data, isLoading, error } = useCurrentlyWatching();

  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Load sort preference from AsyncStorage
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as SortState;
          // Validate that the saved option is still valid
          if (ALLOWED_SORT_OPTIONS.includes(parsed.option)) {
            setSortState(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load sort preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, []);

  // Configure header with sort button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSortModalVisible(true)}
          style={{ marginRight: SPACING.s }}
          activeOpacity={ACTIVE_OPACITY}
          hitSlop={HIT_SLOP.m}
        >
          <ArrowUpDown size={22} color={COLORS.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Handle sort apply and save to AsyncStorage
  const handleApplySort = useCallback(async (newSortState: SortState) => {
    setSortState(newSortState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSortState));
    } catch (error) {
      console.error('Failed to save sort preference:', error);
    }
  }, []);

  // Sort the data based on current sort state
  const sortedData = useMemo(() => {
    if (!data) return [];

    const sorted = [...data];
    const { option, direction } = sortState;
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a: InProgressShow, b: InProgressShow) => {
      switch (option) {
        case 'progress':
          return (a.percentage - b.percentage) * multiplier;
        case 'alphabetical':
          return a.tvShowName.localeCompare(b.tvShowName) * multiplier;
        case 'lastWatched':
        default:
          return (a.lastUpdated - b.lastUpdated) * multiplier;
      }
    });

    return sorted;
  }, [data, sortState]);

  const renderItem = ({ item }: { item: InProgressShow }) => <WatchingShowCard show={item} />;

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your watch history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (sortedData.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={TvIcon}
          title="No Shows in Progress"
          description="Start watching a show to see your progress tracked here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={sortedData}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.tvShowId.toString()}
      />

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={ALLOWED_SORT_OPTIONS}
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
  listContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
});
