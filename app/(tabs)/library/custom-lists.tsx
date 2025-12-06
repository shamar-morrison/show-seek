import CreateListModal from '@/src/components/CreateListModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { filterCustomLists } from '@/src/constants/lists';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ChevronRight, FolderPlus, List, Plus } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CustomListsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: lists, isLoading } = useLists();
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const ItemSeparator = () => <View style={styles.separator} />;

  const customLists = useMemo(() => {
    if (!lists) return [];
    return filterCustomLists(lists);
  }, [lists]);

  const handleCreateList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCreateModalVisible(true);
  }, []);

  const handleCreateSuccess = useCallback(
    (listId: string) => {
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleCreateList}
          style={{ marginRight: SPACING.s }}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Plus size={24} color={COLORS.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleCreateList]);

  const handleListPress = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: UserList }) => (
      <Pressable
        style={({ pressed }) => [styles.listCard, pressed && styles.listCardPressed]}
        onPress={() => handleListPress(item.id)}
      >
        <List size={24} color={COLORS.primary} />
        <Text style={styles.listName}>{item.name}</Text>
        <ChevronRight size={20} color={COLORS.textSecondary} />
      </Pressable>
    ),
    [handleListPress]
  );

  const keyExtractor = useCallback((item: UserList) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {customLists.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="No Custom Lists"
            description="Create custom lists to organize your favorite content"
            actionLabel="Create List"
            onAction={handleCreateList}
          />
        ) : (
          <FlashList
            data={customLists}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
          />
        )}
      </SafeAreaView>
      <CreateListModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onSuccess={handleCreateSuccess}
      />
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
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  listCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  listName: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  separator: {
    height: SPACING.m,
  },
});
