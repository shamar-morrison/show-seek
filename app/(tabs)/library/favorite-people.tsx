import { EmptyState } from '@/src/components/library/EmptyState';
import { PersonCard } from '@/src/components/library/PersonCard';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { FavoritePerson } from '@/src/types/favoritePerson';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { User } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FavoritePeopleScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: favoritePersons, isLoading } = useFavoritePersons();

  const sortedPersons = useMemo(() => {
    if (!favoritePersons) return [];
    return [...favoritePersons].sort((a, b) => b.addedAt - a.addedAt);
  }, [favoritePersons]);

  const handlePersonPress = useCallback(
    (personId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!currentTab) {
        console.warn('Cannot navigate to person: currentTab is null');
        return;
      }
      const path = `/(tabs)/${currentTab}/person/${personId}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: FavoritePerson }) => (
      <PersonCard person={item} onPress={handlePersonPress} />
    ),
    [handlePersonPress]
  );

  const keyExtractor = useCallback((item: FavoritePerson) => item.id.toString(), []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedPersons.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={User}
          title="No Favorite People"
          description="Favorite actors and directors to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={sortedPersons}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={3}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
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
    padding: SPACING.m,
  },
  columnWrapper: {
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
});
