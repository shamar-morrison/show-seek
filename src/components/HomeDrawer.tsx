import { ProfileBackgroundImage } from '@/src/components/profile/ProfileBackgroundImage';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HOME_DRAWER_WIDTH_RATIO,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ArrowRight01Icon,
  Calendar03Icon,
  Logout01Icon,
  PaintBoardIcon,
  Tv01Icon,
  UserAiIcon,
} from '@hugeicons/core-free-icons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Divider } from 'react-native-paper';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * HOME_DRAWER_WIDTH_RATIO;

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
  const { user, isGuest, signOut } = useAuth();
  const { profileBackground } = useProfileBackground();
  const background = isGuest ? null : profileBackground;
  const { isPremium } = usePremium();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const displayName = isGuest
    ? t('profile.guestUser')
    : resolvePreferredDisplayName(user?.displayName, null, user?.email) || t('profile.user');
  const email = user?.email || t('profile.noEmail');

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

  const handleProfilePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    // This screen is in another tab. Anchoring it keeps Settings underneath for the back button.
    router.push('/(tabs)/profile/account', { withAnchor: true });
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

  const handleMoodPickerPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({ pathname: '/(tabs)/home/mood-picker' });
  };

  const handleWhereToWatchPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push({ pathname: '/(tabs)/home/where-to-watch' });
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      Alert.alert(t('common.errorTitle'), t('auth.signOutFailed'));
    } finally {
      setIsSigningOut(false);
      onClose();
    }
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
            // With a background, the profile card takes the status bar's space so the image runs
            // up behind it, like a header.
            { paddingTop: background ? 0 : insets.top, paddingBottom: insets.bottom },
          ]}
        >
          {/* User Profile Section */}
          <Pressable
            style={({ pressed }) => [
              styles.userSection,
              background && [
                styles.userSectionWithBackground,
                { paddingTop: insets.top + SPACING.xl },
              ],
              pressed && styles.navigationCardPressed,
            ]}
            onPress={handleProfilePress}
            accessibilityRole="button"
            accessibilityLabel={t('settings.account')}
            testID="home-drawer-profile"
          >
            {background ? (
              <ProfileBackgroundImage background={background} fadeTo={COLORS.surface} />
            ) : null}
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
              {!isGuest && (
                <Text style={styles.email} numberOfLines={1}>
                  {email}
                </Text>
              )}
            </View>
          </Pressable>

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
              <AppIcon icon={UserAiIcon} size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('forYou.title')}</Text>
              <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.navigationCard,
                pressed && styles.navigationCardPressed,
              ]}
              onPress={handleCalendarPress}
            >
              <AppIcon icon={Calendar03Icon} size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('calendar.title')}</Text>
              <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.navigationCard,
                pressed && styles.navigationCardPressed,
              ]}
              onPress={handleMoodPickerPress}
            >
              <AppIcon icon={PaintBoardIcon} size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('mood.picker')}</Text>
              <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.navigationCard,
                pressed && styles.navigationCardPressed,
              ]}
              onPress={handleWhereToWatchPress}
            >
              <AppIcon icon={Tv01Icon} size={24} color={accentColor} />
              <Text style={styles.navigationTitle}>{t('whereToWatch.title')}</Text>
              <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Footer Section */}
          <View style={styles.footerSection}>
            <Divider style={styles.divider} />
            <Pressable
              style={({ pressed }) => [
                styles.signOutButton,
                !isSigningOut && pressed && styles.signOutPressed,
              ]}
              onPress={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <AppIcon icon={Logout01Icon} size={24} color={COLORS.error} />
              )}
              <Text style={styles.signOutText}>
                {isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Modal>
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
  userSectionWithBackground: {
    overflow: 'hidden',
    position: 'relative',
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: 18,
    fontFamily: FONT_FAMILY.semiBold,
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
  // Looks the same as the action buttons on movie and TV pages. Those are 6% white over the black
  // page, which shows as #0F0F0F; the drawer's surface is lighter, so that colour is used solid
  // here. The 20% white border then sits over the same colour as theirs.
  navigationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F0F',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: SPACING.m,
  },
  navigationCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  navigationTitle: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.error,
  },
  signOutPressed: {
    opacity: ACTIVE_OPACITY,
  },
});
