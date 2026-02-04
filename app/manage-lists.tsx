import RenameListModal, { RenameListModalRef } from '@/src/components/RenameListModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react-native';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_LIST_IDS = [
  'favorites',
  'watchlist',
  'currently-watching',
  'already-watched',
  'dropped',
];

export default function ManageListsScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();
  const renameModalRef = useRef<RenameListModalRef>(null);
  const { requireAuth, AuthGuardModal } = useAuthGuard();
  const { t } = useTranslation();

  const handleRenameList = (listId: string, currentName: string, currentDescription?: string) => {
    requireAuth(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      renameModalRef.current?.present({
        listId,
        currentName,
        currentDescription,
      });
    }, t('library.signInToRenameList'));
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

  const customLists = lists?.filter((list) => !DEFAULT_LIST_IDS.includes(list.id)) || [];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={screenStyles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ArrowLeft size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('library.manageLists')}</Text>
          <View style={{ width: 28 }} />
        </View>

        {isLoading ? (
          <FullScreenLoading />
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('library.defaultLists')}</Text>
              <Text style={styles.sectionSubtitle}>{t('library.defaultListsDescription')}</Text>
              {lists
                ?.filter((list) => DEFAULT_LIST_IDS.includes(list.id))
                .map((list) => (
                  <View key={list.id} style={styles.listItem}>
                    <View style={styles.listInfo}>
                      <Text style={styles.listName}>{list.name}</Text>
                      <Text style={styles.listCount}>
                        {(() => {
                          const count = Object.keys(list.items || {}).length;
                          return count === 1 ? t('library.itemCountOne') : t('library.itemCount', { count });
                        })()}
                      </Text>
                    </View>
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>{t('library.defaultBadge')}</Text>
                    </View>
                  </View>
                ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('library.customLists')}</Text>
              {customLists.length > 0 ? (
                <>
                  <Text style={styles.sectionSubtitle}>{t('library.customListsDescription')}</Text>
                  {customLists.map((list) => (
                    <View key={list.id} style={styles.listItem}>
                      <View style={styles.listInfo}>
                        <Text style={styles.listName}>{list.name}</Text>
                        <Text style={styles.listCount}>
                          {(() => {
                            const count = Object.keys(list.items || {}).length;
                            return count === 1 ? t('library.itemCountOne') : t('library.itemCount', { count });
                          })()}
                        </Text>
                      </View>
                      <View style={styles.listActions}>
                        <TouchableOpacity
                          onPress={() =>
                            handleRenameList(list.id, list.name, list.description ?? '')
                          }
                          style={styles.actionButton}
                          activeOpacity={ACTIVE_OPACITY}
                        >
                          <Pencil size={20} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteList(list.id, list.name)}
                          style={styles.actionButton}
                          activeOpacity={ACTIVE_OPACITY}
                        >
                          <Trash2 size={20} color={COLORS.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.emptyText}>{t('library.emptyLists')}</Text>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
      <RenameListModal ref={renameModalRef} />
      {AuthGuardModal}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.l,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
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
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
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
    fontWeight: '600',
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
