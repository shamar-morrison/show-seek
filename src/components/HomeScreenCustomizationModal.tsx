import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  AVAILABLE_TMDB_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '@/src/constants/homeScreenLists';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useUpdateHomeScreenLists } from '@/src/hooks/usePreferences';
import { useSheetListHeight } from '@/src/hooks/useSheetListHeight';
import { UserList } from '@/src/services/ListService';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { HomeListType, HomeScreenListItem } from '@/src/types/preferences';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import { PremiumBadge } from './ui/PremiumBadge';

const TMDB_LIST_LABEL_KEYS: Record<string, string> = {
  'latest-trailers': 'home.latestTrailers',
  'trending-movies': 'home.trendingMovies',
  'trending-tv': 'home.trendingTV',
  'popular-movies': 'home.popularMovies',
  'top-rated-movies': 'home.topRated',
  'upcoming-movies': 'home.upcomingMovies',
  'upcoming-tv': 'home.upcomingTV',
};

export interface HomeScreenCustomizationModalRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface HomeScreenCustomizationModalProps {
  onShowToast?: (message: string) => void;
  resolvedHomeScreenLists: HomeScreenListItem[];
  customLists: Pick<UserList, 'id' | 'name'>[];
}

interface ListItemProps {
  id: string;
  label: string;
  type: HomeListType;
  isSelected: boolean;
  onToggle: (item: HomeScreenListItem) => void;
  isPremiumLocked?: boolean;
}

const ListItem = ({ id, label, type, isSelected, onToggle, isPremiumLocked }: ListItemProps) => {
  const { accentColor } = useAccentColor();
  return (
    <Pressable
      testID={`home-customization-row-${id}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      style={styles.listItem}
      onPress={() => onToggle({ id, type, label })}
    >
      <View
        style={[
          styles.checkbox,
          isSelected && { backgroundColor: accentColor, borderColor: accentColor },
        ]}
      >
        <AnimatedCheck visible={isSelected} />
      </View>
      <Text style={styles.listName}>{label}</Text>
      {isPremiumLocked && <PremiumBadge />}
    </Pressable>
  );
};

const HomeScreenCustomizationModal = forwardRef<
  HomeScreenCustomizationModalRef,
  HomeScreenCustomizationModalProps
>(({ onShowToast, resolvedHomeScreenLists, customLists }, ref) => {
  const sheetRef = useRef<TrueSheet>(null);
  const { width } = useWindowDimensions();
  const { listStyle, onContentLayout, onListLayout, onListContentSizeChange, resetListHeight } =
    useSheetListHeight();
  const updateMutation = useUpdateHomeScreenLists();
  const { user } = useAuth();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  // Latest Trailers is premium-only.
  const isAuthenticated = !!user;
  const canAccessTrailers = isAuthenticated && isPremium;

  // Local state for pending selections (only persisted on Apply)
  const [pendingSelections, setPendingSelections] = useState<HomeScreenListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const initializeSelections = useCallback(() => {
    setPendingSelections([...resolvedHomeScreenLists]);
    setError(null);
    setSearchQuery('');
  }, [resolvedHomeScreenLists]);

  const { tmdbRows, watchStatusRows, customRows } = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matches = (label: string) =>
      !normalizedQuery || label.toLowerCase().includes(normalizedQuery);

    return {
      tmdbRows: AVAILABLE_TMDB_LISTS.map((list) => ({
        id: list.id,
        label: t(TMDB_LIST_LABEL_KEYS[list.id] ?? list.label),
      })).filter((row) => matches(row.label)),
      watchStatusRows: WATCH_STATUS_LISTS.map((list) => ({
        id: list.id,
        label: t(list.labelKey),
      })).filter((row) => matches(row.label)),
      customRows: customLists
        .map((list) => ({ id: list.id, label: list.name }))
        .filter((row) => matches(row.label)),
    };
  }, [customLists, searchQuery, t]);

  const hasNoSearchResults =
    searchQuery.trim().length > 0 &&
    tmdbRows.length === 0 &&
    watchStatusRows.length === 0 &&
    customRows.length === 0;

  useImperativeHandle(ref, () => ({
    present: async () => {
      initializeSelections();
      resetListHeight();
      await sheetRef.current?.present();
    },
    dismiss: async () => {
      await sheetRef.current?.dismiss();
    },
  }));

  const handleToggle = useCallback(
    (item: HomeScreenListItem) => {
      // Check if this is a premium-locked item
      if (item.id === 'latest-trailers' && isPremiumLoading) {
        return;
      }

      if (item.id === 'latest-trailers' && !canAccessTrailers) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        sheetRef.current?.dismiss();
        router.push('/premium');
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setError(null);

      setPendingSelections((current) => {
        const isSelected = current.some((s) => s.id === item.id);

        if (isSelected) {
          if (current.length <= MIN_HOME_LISTS) {
            setError(t('homeCustomization.minSelected', { count: MIN_HOME_LISTS }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return current;
          }
          return current.filter((s) => s.id !== item.id);
        } else {
          if (current.length >= MAX_HOME_LISTS) {
            setError(t('homeCustomization.maxSelected', { count: MAX_HOME_LISTS }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return current;
          }
          return [...current, item];
        }
      });
    },
    [canAccessTrailers, isPremiumLoading, router, t]
  );

  // Nothing to apply when the same lists are chosen in the same order (order sets the
  // order of Home sections).
  const canApply =
    pendingSelections.length !== resolvedHomeScreenLists.length ||
    pendingSelections.some((item, index) => item.id !== resolvedHomeScreenLists[index]?.id);

  const handleApply = async () => {
    if (!canApply) return;
    try {
      await updateMutation.mutateAsync(pendingSelections);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onShowToast?.(t('homeCustomization.updatedToast'));
      sheetRef.current?.dismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.saveFailed'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCancel = () => {
    sheetRef.current?.dismiss();
  };

  const isSelected = (id: string) => pendingSelections.some((s) => s.id === id);

  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      keyboardMode="pan"
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      grabber={true}
    >
      <GestureHandlerRootView
        style={[modalSheetStyles.content, styles.content, { width }]}
        onLayout={onContentLayout}
      >
        <View style={modalHeaderStyles.header}>
          <Text style={modalHeaderStyles.title}>{t('homeCustomization.title')}</Text>
          <Text testID="home-customization-selected-count" style={styles.subtitle}>
            {t('homeCustomization.selectedCount', {
              selected: pendingSelections.length,
              max: MAX_HOME_LISTS,
            })}
          </Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.searchContainer}>
          <AppIcon icon={Search01Icon} size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('library.searchListPlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            editable={!updateMutation.isPending}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            testID="home-customization-search-input"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              disabled={updateMutation.isPending}
              hitSlop={8}
              testID="home-customization-clear-search-button"
            >
              <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
            </Pressable>
          )}
        </View>

        <ScrollView
          style={[styles.listContainer, listStyle]}
          onLayout={onListLayout}
          onContentSizeChange={onListContentSizeChange}
          showsVerticalScrollIndicator
          nestedScrollEnabled={true}
          keyboardShouldPersistTaps="handled"
        >
          {hasNoSearchResults && (
            <Text style={styles.emptySearchText}>{t('common.noResults')}</Text>
          )}

          {/* TMDB Lists Section */}
          {tmdbRows.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>{t('homeCustomization.tmdbLists')}</Text>
              {tmdbRows.map((row) => (
                <ListItem
                  key={row.id}
                  id={row.id}
                  label={row.label}
                  type="tmdb"
                  isSelected={isSelected(row.id)}
                  onToggle={handleToggle}
                  isPremiumLocked={
                    row.id === 'latest-trailers' && !isPremiumLoading && !canAccessTrailers
                  }
                />
              ))}
            </>
          )}

          {/* Watch Status Lists Section */}
          {watchStatusRows.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>{t('homeCustomization.watchStatus')}</Text>
              {watchStatusRows.map((row) => (
                <ListItem
                  key={row.id}
                  id={row.id}
                  label={row.label}
                  type="default"
                  isSelected={isSelected(row.id)}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}

          {/* Custom Lists Section */}
          {customRows.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>{t('library.customLists')}</Text>
              {customRows.map((row) => (
                <ListItem
                  key={row.id}
                  id={row.id}
                  label={row.label}
                  type="custom"
                  isSelected={isSelected(row.id)}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={updateMutation.isPending}
          >
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.applyButton,
              { backgroundColor: accentColor },
              (updateMutation.isPending || !canApply) && styles.disabledButton,
            ]}
            onPress={handleApply}
            disabled={updateMutation.isPending || !canApply}
            accessibilityRole="button"
            accessibilityState={{ disabled: updateMutation.isPending || !canApply }}
            testID="home-customization-apply-button"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
            )}
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </TrueSheet>
  );
});

HomeScreenCustomizationModal.displayName = 'HomeScreenCustomizationModal';

export default HomeScreenCustomizationModal;

const styles = StyleSheet.create({
  content: {
    paddingBottom: SPACING.l,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  errorBanner: {
    backgroundColor: COLORS.error,
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.m,
  },
  errorText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    marginBottom: SPACING.s,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    paddingVertical: SPACING.m,
  },
  emptySearchText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  listContainer: {
    marginBottom: SPACING.m,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    marginRight: SPACING.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listName: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.m,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
  },
  applyButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
});
