import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { Href, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { BackHandler, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Divider, Drawer } from 'react-native-paper';
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
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const translateX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const isGuest = !user || user.isAnonymous;
  const displayName = user?.displayName || (isGuest ? 'Guest' : 'User');
  const email = user?.email || (isGuest ? 'Not signed in' : 'No email');

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

  // Paper theme override for dark mode
  const paperTheme = {
    colors: {
      onSecondaryContainer: COLORS.text,
      onSurfaceVariant: COLORS.textSecondary,
      secondaryContainer: 'transparent',
    },
  };

  return (
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

        {/* Menu Items */}
        <Drawer.Section style={styles.drawerSection} showDivider={false} theme={paperTheme}>
          <Drawer.Item
            label="For You"
            icon={({ size, color }) => <Sparkles size={size} color={color} />}
            onPress={() => {
              onClose();
              router.push('/(tabs)/home/for-you' as Href);
            }}
            theme={paperTheme}
            style={styles.drawerItem}
          />
        </Drawer.Section>
      </Animated.View>
    </Modal>
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
  drawerSection: {
    marginTop: SPACING.s,
  },
  drawerItem: {
    backgroundColor: 'transparent',
  },
});
