import { HomeDrawer } from '@/src/components/HomeDrawer';
import { HomeListSection } from '@/src/components/HomeListSection';
import HomeScreenCustomizationModal, {
  HomeScreenCustomizationModalRef,
} from '@/src/components/HomeScreenCustomizationModal';
import { HomeListSectionSkeleton } from '@/src/components/skeletons/HomeListSectionSkeleton';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { usePreferences } from '@/src/hooks/usePreferences';
import { screenStyles } from '@/src/styles/screenStyles';
import { useQueryClient } from '@tanstack/react-query';
import { Menu, Settings2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const modalRef = useRef<HomeScreenCustomizationModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const queryClient = useQueryClient();
  const { homeScreenLists, isLoading: isLoadingPreferences } = usePreferences();
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  // Check if user can access Latest Trailers (signed in + premium)
  const canAccessTrailers = useMemo(() => {
    return !!user && isPremium;
  }, [user, isPremium]);

  // Check if we need to show Top Rated at the end for users without trailer access.
  const showTopRatedAtEnd = useMemo(() => {
    return !canAccessTrailers && homeScreenLists.some((config) => config.id === 'latest-trailers');
  }, [canAccessTrailers, homeScreenLists]);

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
    modalRef.current?.present();
  };

  const handleOpenDrawer = () => {
    setDrawerVisible(true);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <HeaderIconButton onPress={handleOpenDrawer}>
          <Menu size={24} color={COLORS.text} />
        </HeaderIconButton>
        <View style={styles.headerTitleContainer} pointerEvents="none">
          <Text style={[styles.headerTitle, { color: accentColor }]}>{t('common.appName')}</Text>
        </View>
        <HeaderIconButton onPress={handleOpenCustomization}>
          <Settings2 size={24} color={COLORS.text} />
        </HeaderIconButton>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
            colors={[accentColor]}
          />
        }
      >
        {/* Show skeleton sections while preferences are loading for signed-in users */}
        {/* This prevents layout shift when user's customized list loads */}
        {isLoadingPreferences && user ? (
          <>
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
            <HomeListSectionSkeleton />
          </>
        ) : (
          <>
            {homeScreenLists.map((config) => (
              <HomeListSection key={config.id} config={config} />
            ))}

            {/* Show Top Rated at the end when Latest Trailers is unavailable */}
            {showTopRatedAtEnd && (
              <HomeListSection
                config={{ id: 'top-rated-movies', type: 'tmdb', label: t('home.topRated') }}
              />
            )}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <HomeScreenCustomizationModal ref={modalRef} onShowToast={handleShowToast} />
      <HomeDrawer visible={drawerVisible} onClose={handleCloseDrawer} />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    letterSpacing: -1.5,
  },
  scrollView: {
    flex: 1,
  },
});
