import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import RenameListModal, { RenameListModalRef } from '@/src/components/RenameListModal';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
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
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import type { UserList } from '@/src/services/ListService';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  Delete02Icon,
  PencilEdit01Icon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_LIST_IDS = [
  'favorites',
  'watchlist',
  'currently-watching',
  'already-watched',
  'dropped',
];

const getListSearchText = (list: UserList) => `${list.name} ${list.description ?? ''}`;

export default function ManageListsScreen() {
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const deleteMutation = useDeleteList();
  const renameModalRef = useRef<RenameListModalRef>(null);
  const createListModalRef = useRef<CreateListModalRef>(null);
  const { t } = useTranslation();

  const handleCreateCustomList = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void createListModalRef.current?.present();
  };

  const handleRenameList = (listId: string, currentName: string, currentDescription?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    renameModalRef.current?.present({
      listId,
      currentName,
      currentDescription,
    });
  };

  const handleDeleteList = (listId: string, listName: string) => {
    if (DEFAULT_LIST_IDS.includes(listId)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('library.cannotDeleteTitle'), t('library.cannotDeleteDefaultLists'), [
        { text: t('common.ok') },
      ]);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('library.deleteList'),
      `${t('library.confirmDeleteList', { name: listName })}\n${t('library.deleteListWarning')}`,
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(listId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              console.error('Failed to delete list:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('errors.deleteFailed')
              );
            }
          },
        },
      ]
    );
  };

  const allLists = useMemo(() => lists ?? [], [lists]);

  const {
    searchQuery,
    isSearchActive,
    filteredItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: allLists,
    getSearchableText: getListSearchText,
  });

  const isFiltering = searchQuery.trim().length > 0;

  const { defaultLists, customLists } = useMemo(
    () => ({
      defaultLists: filteredItems.filter((list) => DEFAULT_LIST_IDS.includes(list.id)),
      customLists: filteredItems.filter((list) => !DEFAULT_LIST_IDS.includes(list.id)),
    }),
    [filteredItems]
  );

  const showDefaultSection = !isFiltering || defaultLists.length > 0;
  const showCustomSection = !isFiltering || customLists.length > 0;
  const hasNoSearchResults = isFiltering && !showDefaultSection && !showCustomSection;

  const screenOptions = isSearchActive
    ? {
        headerShown: true,
        title: t('library.manageLists'),
        ...getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchListPlaceholder'),
        }),
      }
    : {
        headerShown: true,
        title: t('library.manageLists'),
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            <HeaderIconButton testID="manage-lists-search-button" onPress={searchButton.onPress}>
              <AppIcon icon={Search01Icon} size={22} color={COLORS.text} />
            </HeaderIconButton>
            <HeaderIconButton testID="create-custom-list-button" onPress={handleCreateCustomList}>
              <AppIcon icon={PlusSignIcon} size={24} color={COLORS.text} />
            </HeaderIconButton>
          </View>
        ),
      };

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />

        {isLoading ? (
          <FullScreenLoading />
        ) : isError ? (
          <QueryErrorState
            title={t('library.manageLists')}
            error={error}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : (
          <ScrollView
            style={styles.content}
            contentContainerStyle={[
              styles.contentContainer,
              hasNoSearchResults && styles.emptyContentContainer,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {hasNoSearchResults && <SearchEmptyState />}
            {showDefaultSection && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('library.defaultLists')}</Text>
                <Text style={styles.sectionSubtitle}>{t('library.defaultListsDescription')}</Text>
                {defaultLists.map((list) => (
                  <View key={list.id} style={styles.listItem}>
                    <View style={styles.listInfo}>
                      <Text style={styles.listName}>{list.name}</Text>
                      <Text style={styles.listCount}>
                        {(() => {
                          const count = Object.keys(list.items || {}).length;
                          return count === 1
                            ? t('library.itemCountOne')
                            : t('library.itemCount', { count });
                        })()}
                      </Text>
                    </View>
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>{t('library.defaultBadge')}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {showCustomSection && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('library.customLists')}</Text>
                {customLists.length > 0 ? (
                  <>
                    <Text style={styles.sectionSubtitle}>
                      {t('library.customListsDescription')}
                    </Text>
                    {customLists.map((list) => {
                      const isDeletingThis =
                        deleteMutation.isPending && deleteMutation.variables === list.id;
                      const actionsDisabled = deleteMutation.isPending;

                      return (
                        <View
                          key={list.id}
                          testID={`manage-list-row-${list.id}`}
                          style={[styles.listItem, isDeletingThis && styles.listItemDeleting]}
                        >
                          <View style={styles.listInfo}>
                            <Text style={styles.listName}>{list.name}</Text>
                            <Text style={styles.listCount}>
                              {(() => {
                                const count = Object.keys(list.items || {}).length;
                                return count === 1
                                  ? t('library.itemCountOne')
                                  : t('library.itemCount', { count });
                              })()}
                            </Text>
                          </View>
                          <View style={styles.listActions}>
                            <TouchableOpacity
                              testID={`rename-list-${list.id}`}
                              onPress={() =>
                                handleRenameList(list.id, list.name, list.description ?? '')
                              }
                              style={styles.actionButton}
                              activeOpacity={ACTIVE_OPACITY}
                              disabled={actionsDisabled}
                            >
                              <AppIcon
                                icon={PencilEdit01Icon}
                                size={20}
                                color={COLORS.textSecondary}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              testID={`delete-list-${list.id}`}
                              onPress={() => handleDeleteList(list.id, list.name)}
                              style={styles.actionButton}
                              activeOpacity={ACTIVE_OPACITY}
                              disabled={actionsDisabled}
                            >
                              {isDeletingThis ? (
                                <ActivityIndicator size="small" color={COLORS.error} />
                              ) : (
                                <AppIcon icon={Delete02Icon} size={20} color={COLORS.error} />
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <Text style={styles.emptyText}>{t('library.emptyLists')}</Text>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      <RenameListModal ref={renameModalRef} />
      <CreateListModal ref={createListModalRef} />
    </>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.l,
  },
  emptyContentContainer: {
    flexGrow: 1,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  listItemDeleting: {
    opacity: 0.5,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
    marginBottom: 4,
  },
  listCount: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  defaultBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.round,
  },
  defaultBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  listActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  actionButton: {
    padding: SPACING.s,
  },
  emptyText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
});
