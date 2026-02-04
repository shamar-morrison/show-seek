import { UserAvatar } from '@/src/components/ui/UserAvatar';
import LoadingModal from '@/src/components/ui/LoadingModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Calendar, ChevronRight, LogOut, Sparkles } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Divider } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;

export interface HomeDrawerProps {
  /** Whether the drawer is visible */
  visible: boolean;
  /** Callback when the drawer should close */
  onClose: () => void;
}

/**
 * Side drawer for the Home screen displaying user profile and navigation items.
 * Slides in from the left with backdrop overlay.
 */
export function HomeDrawer({ visible, onClose }: HomeDrawerProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user, signOut } = useAuth();
  const { isPremium } = usePremium();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const isGuest = !user || user.isAnonymous;
  const displayName = user?.displayName || (isGuest ? t('profile.guest') : t('profile.user'));
  const email = user?.email || (isGuest ? t('auth.notSignedIn') : t('profile.noEmail'));

  useEffect(() => {
    if (visible) {
      translateX.value = withTiming(0, { duration: 250 });
      backdropOpacity.value = withTiming(0.5, { duration: 250 });
    } else {
      translateX.value = withTiming(-DRAWER_WIDTH, { duration: 200 });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, translateX, backdropOpacity]);

  // Handle Android back button
  useEffect(() => {
    if (!visible) return;

    const handleBackPress = () => {
      onClose();
      return true; // Prevent default back behavior
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [visible, onClose]);

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleBackdropPress = () => {
    onClose();
  };

  const handleForYouPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({ pathname: '/(tabs)/home/for-you' });
  };

  const handleCalendarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({ pathname: '/(tabs)/home/calendar' });
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    
    // Small delay to allow drawer to start closing before showing loading
    setTimeout(async () => {
      setIsSigningOut(true);
      try {
        await signOut();
      } catch {
        setIsSigningOut(false);
        Alert.alert(t('common.errorTitle'), t('auth.signOutFailed'));
      }
    }, 300);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress}>
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
        </Pressable>

        {/* Drawer Container */}
        <Animated.View
          style={[
            styles.drawerContainer,
            drawerAnimatedStyle,
            { paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {/* User Profile Section */}
          <View style={styles.userSection}>
            <UserAvatar
              photoURL={user?.photoURL}
              displayName={user?.displayName}
              email={user?.email}
              size={60}
              showPremiumBadge={isPremium}
            />
            <View style={styles.userInfo}>
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Navigation Items */}
          <View style={styles.navigationSection}>
            <Pressable
              style={({ pressed }) => [
                styles.navigationCard,
                pressed && styles.navigationCardPressed,
              ]}
              onPress={handleForYouPress}
            >
              <Sparkles size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('forYou.title')}</Text>
              <ChevronRight size={20} color={COLORS.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.navigationCard,
                pressed && styles.navigationCardPressed,
              ]}
              onPress={handleCalendarPress}
            >
              <Calendar size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('calendar.title')}</Text>
              <ChevronRight size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Footer Section */}
          <View style={styles.footerSection}>
            <Divider style={styles.divider} />
            <Pressable
              style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}
              onPress={handleSignOut}
            >
              <LogOut size={24} color={COLORS.error} />
              <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>

      <LoadingModal visible={isSigningOut} message={t('auth.signingOut')} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.black,
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: COLORS.surface,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.l,
    gap: SPACING.m,
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  divider: {
    backgroundColor: COLORS.surfaceLight,
    marginHorizontal: SPACING.m,
  },
  navigationSection: {
    marginTop: SPACING.m,
    paddingHorizontal: SPACING.m,
    gap: SPACING.m,
  },
  navigationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  navigationCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  navigationTitle: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  footerSection: {
    marginBottom: SPACING.m,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.l,
    gap: SPACING.m,
  },
  signOutText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.error,
  },
  signOutPressed: {
    opacity: ACTIVE_OPACITY,
  },
});
