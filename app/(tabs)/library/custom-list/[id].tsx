import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function CustomListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();
  const { requireAuth, isAuthenticated, AuthGuardModal } = useAuthGuard();

  const {
    handleItemPress,
    handleLongPress,
    handleCloseModal,
    handleShowToast,
    modalVisible,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

  const listItems = useMemo(() => {
    if (!list?.items) return [];
    return Object.values(list.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [list]);

  const handleDeleteList = useCallback(() => {
    if (!list || !id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete List',
      `This will remove "${list.name}" and all its items. This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isAuthenticated) {
              requireAuth(() => {}, 'Sign in to delete this list');
              return;
            }
            try {
              await deleteMutation.mutateAsync(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error) {
              console.error('Failed to delete list:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Failed to delete list'
              );
            }
          },
        },
      ]
    );
  }, [list, id, deleteMutation, router, requireAuth, isAuthenticated]);

  // Navigate back if list is deleted
  useEffect(() => {
    if (!isLoading && lists && !list) {
      router.back();
    }
  }, [isLoading, lists, list, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!list) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDeleteList}
              style={{ marginRight: SPACING.s }}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Trash2 size={22} color={COLORS.error} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.container}>
        <MediaGrid
          items={listItems}
          isLoading={isLoading}
          emptyState={{
            icon: Bookmark,
            title: 'No items yet',
            description: `Add movies and TV shows to this list to see them here.`,
            actionLabel: 'Browse Content',
            onAction: () => router.push('/(tabs)/discover' as any),
          }}
          onItemPress={handleItemPress}
          onItemLongPress={handleLongPress}
        />
      </View>

      {selectedMediaItem && (
        <AddToListModal
          visible={modalVisible}
          onClose={handleCloseModal}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}

      <Toast ref={toastRef} />
      {AuthGuardModal}
    </>
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
});
