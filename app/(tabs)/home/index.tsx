import { HomeListSection } from '@/src/components/HomeListSection';
import HomeScreenCustomizationModal, {
  HomeScreenCustomizationModalRef,
} from '@/src/components/HomeScreenCustomizationModal';
import { ACTIVE_OPACITY, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const modalRef = useRef<HomeScreenCustomizationModalRef>(null);
  const queryClient = useQueryClient();
  const { homeScreenLists } = usePreferences();

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    // Invalidate all TMDB queries to refetch data
    await queryClient.invalidateQueries({ queryKey: ['trending'] });
    await queryClient.invalidateQueries({ queryKey: ['popular'] });
    await queryClient.invalidateQueries({ queryKey: ['topRated'] });
    await queryClient.invalidateQueries({ queryKey: ['upcoming'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleShowToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ShowSeek</Text>
        <TouchableOpacity
          onPress={() => modalRef.current?.present()}
          activeOpacity={ACTIVE_OPACITY}
          hitSlop={HIT_SLOP.m}
        >
          <Settings2 size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {homeScreenLists.map((config) => (
          <HomeListSection key={config.id} config={config} />
        ))}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Toast Message */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <HomeScreenCustomizationModal ref={modalRef} onShowToast={handleShowToast} />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  scrollView: {
    flex: 1,
  },
  toast: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.l,
    right: SPACING.l,
    backgroundColor: COLORS.surface,
    padding: SPACING.m,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
  },
});
