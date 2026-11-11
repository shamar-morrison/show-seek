/**
 * "Position backdrop": drag a poster or backdrop to choose which part shows behind the profile.
 * The large frame previews the Account header (with the avatar and name over it) and is what you
 * drag; the smaller one previews the shorter Home drawer header with the same choice.
 */
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  BUTTON_HEIGHT,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HOME_DRAWER_WIDTH_RATIO,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import {
  dragFocus,
  getCoverGeometry,
  getProfileBackgroundFocus,
  getProfileBackgroundUrl,
  type ProfileBackground,
  type ProfileBackgroundFocus,
} from '@/src/utils/profileBackground';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/** Roughly the Account screen's profile block with a backdrop (avatar, name and email). */
const ACCOUNT_HEADER_HEIGHT = 260;
/** The drawer header below the status bar: top space, 60px avatar, bottom space. */
const DRAWER_HEADER_CONTENT_HEIGHT = SPACING.xl + 60 + SPACING.l;

interface ProfileBackdropPositionerProps {
  background: ProfileBackground;
  onCancel: () => void;
  /** Called with the chosen part; the caller saves it. */
  onConfirm: (focus: ProfileBackgroundFocus) => void;
  /** "Save" in the image viewer, "Done" in Edit Profile (which saves on its own Save). */
  confirmLabel: string;
  isSaving?: boolean;
}

/** Same layered fade as ProfileBackgroundImage. */
function Fade({ to }: { to: string }) {
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.2)', to]}
      locations={[0, 0.45, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

export function ProfileBackdropPositioner({
  background,
  onCancel,
  onConfirm,
  confirmLabel,
  isSaving = false,
}: ProfileBackdropPositionerProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const uri = getProfileBackgroundUrl(background) ?? undefined;
  const displayName = resolvePreferredDisplayName(user?.displayName, null, user?.email) ?? '';

  const [focus, setFocus] = useState(() => getProfileBackgroundFocus(background));
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const accountFrame = { width: windowWidth, height: ACCOUNT_HEADER_HEIGHT };
  const drawerFrame = {
    width: windowWidth * HOME_DRAWER_WIDTH_RATIO,
    height: insets.top + DRAWER_HEADER_CONTENT_HEIGHT,
  };
  const geometry = imageSize ? getCoverGeometry(imageSize, accountFrame) : null;
  const drawerGeometry = imageSize ? getCoverGeometry(imageSize, drawerFrame) : null;

  // The responder is made once, so it reads the latest values through refs.
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const dragStartRef = useRef(focus);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragStartRef.current = focusRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          if (!geometryRef.current) return;
          setFocus(dragFocus(dragStartRef.current, gesture.dx, gesture.dy, geometryRef.current));
        },
      }),
    []
  );

  /** The image drawn at its cover size and shifted to show the chosen part. */
  const placed = (g: NonNullable<typeof geometry>) => ({
    width: g.width,
    height: g.height,
    left: -focus.x * g.overflowX,
    top: -focus.y * g.overflowY,
  });

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom']}
      testID="profile-backdrop-positioner"
    >
      <Text style={styles.title} numberOfLines={1}>
        {t('profile.positionBackdrop')}
      </Text>

      <Text style={styles.hint}>{t('profile.positionHint')}</Text>

      {/* Account header: drag to choose. */}
      <View
        style={[styles.frame, accountFrame]}
        {...panResponder.panHandlers}
        accessibilityLabel={t('profile.positionHint')}
        testID="profile-backdrop-frame"
      >
        {geometry ? (
          <Image
            source={{ uri }}
            style={[styles.placedImage, placed(geometry)]}
            contentFit="fill"
            testID="profile-backdrop-image"
          />
        ) : (
          // Shown until its size is known, which the drag needs.
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={(event) =>
              setImageSize({ width: event.source.width, height: event.source.height })
            }
            testID="profile-backdrop-loading-image"
          />
        )}
        <Fade to={COLORS.black} />
        <View style={styles.accountIdentity} pointerEvents="none">
          <UserAvatar
            photoURL={user?.photoURL}
            displayName={user?.displayName}
            email={user?.email}
            size={72}
          />
          <Text style={styles.accountName} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      </View>

      {/* Home drawer header: same choice, shorter shape. */}
      <Text style={styles.previewLabel}>{t('profile.drawerPreview')}</Text>
      <View style={[styles.frame, styles.drawerFrame, drawerFrame]} pointerEvents="none">
        {drawerGeometry ? (
          <Image
            source={{ uri }}
            style={[styles.placedImage, placed(drawerGeometry)]}
            contentFit="fill"
            testID="profile-backdrop-drawer-image"
          />
        ) : null}
        <Fade to={COLORS.surface} />
        <View style={[styles.drawerIdentity, { paddingTop: insets.top + SPACING.xl }]}>
          <UserAvatar
            photoURL={user?.photoURL}
            displayName={user?.displayName}
            email={user?.email}
            size={60}
          />
          <Text style={styles.drawerName} numberOfLines={1}>
            {displayName}
          </Text>
        </View>
      </View>

      {/* Cancel and confirm sit at the bottom, within thumb reach. */}
      <View style={styles.footer} testID="profile-backdrop-footer">
        <Pressable
          onPress={onCancel}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.footerButton,
            styles.cancelButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          testID="profile-backdrop-cancel"
        >
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          onPress={() => onConfirm(focus)}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.footerButton,
            { backgroundColor: accentColor },
            (pressed || isSaving) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSaving, busy: isSaving }}
          testID="profile-backdrop-confirm"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.black,
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.l,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xs,
    textAlign: 'center',
  },
  pressed: {
    opacity: ACTIVE_OPACITY,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.s,
    marginTop: 'auto',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  footerButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    height: BUTTON_HEIGHT,
    justifyContent: 'center',
  },
  // Outlined like the action buttons on movie and TV pages.
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  cancelText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  confirmText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  hint: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.l,
    textAlign: 'center',
  },
  frame: {
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  placedImage: {
    position: 'absolute',
  },
  accountIdentity: {
    alignItems: 'center',
    bottom: SPACING.l,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  accountName: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.l,
    marginTop: SPACING.s,
  },
  previewLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.s,
    marginTop: SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  drawerFrame: {
    alignSelf: 'center',
    borderRadius: 12,
  },
  drawerIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  drawerName: {
    color: COLORS.white,
    flex: 1,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
});
