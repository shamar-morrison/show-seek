import { HomeListSection } from '@/src/components/HomeListSection';
import HomeScreenCustomizationModal, {
  HomeScreenCustomizationModalRef,
} from '@/src/components/HomeScreenCustomizationModal';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const modalRef = useRef<HomeScreenCustomizationModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const queryClient = useQueryClient();
  const { homeScreenLists } = usePreferences();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trending'] }),
      queryClient.invalidateQueries({ queryKey: ['popular'] }),
      queryClient.invalidateQueries({ queryKey: ['topRated'] }),
      queryClient.invalidateQueries({ queryKey: ['upcoming'] }),
      queryClient.invalidateQueries({ queryKey: ['latest-trailers'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  const handleOpenCustomization = () => {
    requireAuth(() => {
      modalRef.current?.present();
    }, 'Sign in to customize your home screen');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ShowSeek</Text>
        <TouchableOpacity
          onPress={handleOpenCustomization}
          activeOpacity={ACTIVE_OPACITY}
          hitSlop={HIT_SLOP.l}
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

      <HomeScreenCustomizationModal ref={modalRef} onShowToast={handleShowToast} />
      <Toast ref={toastRef} />
      {AuthGuardModal}
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
});
