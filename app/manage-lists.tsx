import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import React from 'react';
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

const DEFAULT_LIST_IDS = ['favorites', 'watchlist', 'dropped'];

export default function ManageListsScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();

  const handleDeleteList = (listId: string, listName: string) => {
    if (DEFAULT_LIST_IDS.includes(listId)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Cannot Delete', 'Cannot delete default lists', [{ text: 'OK' }]);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete List',
      `This will remove "${listName}" and all its items. This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(listId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  };

  const customLists = lists?.filter((list) => !DEFAULT_LIST_IDS.includes(list.id)) || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
          <ChevronLeft size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Lists</Text>
        <View style={{ width: 28 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Default Lists</Text>
            <Text style={styles.sectionSubtitle}>These lists cannot be deleted</Text>
            {lists
              ?.filter((list) => DEFAULT_LIST_IDS.includes(list.id))
              .map((list) => (
                <View key={list.id} style={styles.listItem}>
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{list.name}</Text>
                    <Text style={styles.listCount}>
                      {Object.keys(list.items || {}).length} items
                    </Text>
                  </View>
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                </View>
              ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Lists</Text>
            {customLists.length > 0 ? (
              <>
                <Text style={styles.sectionSubtitle}>Tap the trash icon to delete a list</Text>
                {customLists.map((list) => (
                  <View key={list.id} style={styles.listItem}>
                    <View style={styles.listInfo}>
                      <Text style={styles.listName}>{list.name}</Text>
                      <Text style={styles.listCount}>
                        {Object.keys(list.items || {}).length} items
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteList(list.id, list.name)}
                      style={styles.deleteButton}
                      activeOpacity={ACTIVE_OPACITY}
                    >
                      <Trash2 size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.emptyText}>No custom lists yet</Text>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: SPACING.l,
    paddingBottom: 100,
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
  deleteButton: {
    padding: SPACING.s,
  },
  emptyText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
});
