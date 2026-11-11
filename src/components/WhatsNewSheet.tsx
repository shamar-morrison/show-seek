import { AppIcon } from '@/src/components/ui/AppIcon';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import type { WhatsNewAnnouncement, WhatsNewVisual } from '@/src/constants/whatsNew';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { ArrowRight02Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

/** Lets the screen settle first, and is cancelled if the user leaves before it elapses. */
const PRESENT_DELAY_MS = 600;
const ICON_FRAME_SIZE = 96;
const IMAGE_ASPECT_RATIO = 3 / 2;
const MAX_IMAGE_HEIGHT = 240;

interface WhatsNewSheetProps {
  announcement: WhatsNewAnnouncement;
  /** Fires however the sheet was closed. */
  onDismiss: () => void;
  /**
   * Wait before presenting. Home's automatic sheet waits so the screen can settle first; opened
   * on request (Settings > What's New) it should appear at once, so pass 0.
   */
  presentDelayMs?: number;
}

/** Presents itself once, the first time its screen is focused. */
export function WhatsNewSheet({
  announcement,
  onDismiss,
  presentDelayMs = PRESENT_DELAY_MS,
}: WhatsNewSheetProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { width } = useWindowDimensions();
  const sheetRef = useRef<TrueSheet>(null);
  const scrollRef = useRef<ScrollView>(null);
  const hasPresentedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { sections } = announcement;
  const lastIndex = sections.length - 1;
  const imageHeight = Math.min((width - SPACING.l * 2) / IMAGE_ASPECT_RATIO, MAX_IMAGE_HEIGHT);
  // When any section has an image, every visual gets its height so the text stays put on swipe.
  const hasImage = sections.some((section) => section.visual.type === 'image');

  useFocusEffect(
    useCallback(() => {
      if (hasPresentedRef.current) return;

      const timer = setTimeout(() => {
        hasPresentedRef.current = true;
        void sheetRef.current?.present();
      }, presentDelayMs);

      return () => clearTimeout(timer);
    }, [presentDelayMs])
  );

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(index, lastIndex)));
  };

  const handleNext = () => {
    if (activeIndex >= lastIndex) {
      void sheetRef.current?.dismiss();
      return;
    }

    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    scrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  };

  return (
    <TrueSheet
      ref={sheetRef}
      detents={['auto']}
      cornerRadius={BORDER_RADIUS.l}
      backgroundColor={COLORS.surface}
      grabber={false}
      onDidDismiss={onDismiss}
    >
      <GestureHandlerRootView style={[styles.content, { width }]}>
        <Text style={styles.heading}>{t('whatsNew.title')}</Text>

        <ScrollView
          ref={scrollRef}
          {...HORIZONTAL_SCROLL_PROPS}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          testID="whats-new-pager"
        >
          {sections.map((section) => (
            <View key={section.id} style={[styles.page, { width }]} testID="whats-new-section">
              <View style={[styles.visual, hasImage && { height: imageHeight }]}>
                <SectionVisual
                  visual={section.visual}
                  imageHeight={imageHeight}
                  accentColor={accentColor}
                />
              </View>
              <Text style={styles.title}>{t(section.titleKey)}</Text>
              <Text style={styles.description}>{t(section.descriptionKey)}</Text>
            </View>
          ))}
        </ScrollView>

        {sections.length > 1 && (
          <View style={styles.dots}>
            {sections.map((section, index) => (
              <View
                key={section.id}
                style={[
                  styles.dot,
                  index === activeIndex
                    ? { backgroundColor: accentColor, width: 20 }
                    : styles.inactiveDot,
                ]}
                testID={`whats-new-dot-${index}`}
              />
            ))}
          </View>
        )}

        <Pressable
          style={[styles.button, { backgroundColor: accentColor }]}
          onPress={handleNext}
          accessibilityRole="button"
          testID="whats-new-button"
        >
          <Text style={styles.buttonText}>
            {activeIndex >= lastIndex ? t('common.done') : t('common.next')}
          </Text>
        </Pressable>
      </GestureHandlerRootView>
    </TrueSheet>
  );
}

interface SectionVisualProps {
  visual: WhatsNewVisual;
  imageHeight: number;
  accentColor: string;
}

function SectionVisual({ visual, imageHeight, accentColor }: SectionVisualProps) {
  switch (visual.type) {
    case 'image':
      return (
        <Image
          source={visual.source}
          style={[styles.image, { width: imageHeight * IMAGE_ASPECT_RATIO, height: imageHeight }]}
          contentFit="cover"
          testID="whats-new-image"
        />
      );
    case 'syncLogos':
      return (
        <View style={styles.syncLogos} testID="whats-new-sync-logos">
          <Image source={visual.source} contentFit="contain" style={styles.syncSourceLogo} />
          <AppIcon
            icon={ArrowRight02Icon}
            size={24}
            color={COLORS.textSecondary}
            style={styles.syncArrow}
          />
          <View style={styles.showSeekLogoCircle}>
            <Image
              source={require('@/assets/images/icon.png')}
              contentFit="contain"
              style={styles.showSeekLogo}
            />
          </View>
        </View>
      );
    case 'icon':
      return (
        <View
          style={[styles.iconFrame, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}
          testID="whats-new-icon"
        >
          <AppIcon icon={visual.icon} size={44} color={accentColor} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  content: {
    paddingTop: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  heading: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  page: {
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
  },
  visual: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  iconFrame: {
    width: ICON_FRAME_SIZE,
    height: ICON_FRAME_SIZE,
    borderRadius: ICON_FRAME_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderRadius: BORDER_RADIUS.l,
  },
  syncLogos: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncSourceLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  syncArrow: {
    // Optically centers it: the ShowSeek logo has empty space inside its circle.
    marginLeft: SPACING.l,
    marginRight: SPACING.s,
  },
  showSeekLogoCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  showSeekLogo: {
    width: 92,
    height: 92,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  description: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.s,
    marginTop: SPACING.l,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BORDER_RADIUS.round,
  },
  inactiveDot: {
    backgroundColor: COLORS.surfaceLight,
  },
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    paddingVertical: SPACING.m,
    marginTop: SPACING.l,
    marginHorizontal: SPACING.l,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
});
