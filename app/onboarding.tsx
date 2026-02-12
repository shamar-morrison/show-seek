import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ChevronRight, Film } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const VIDEO_ASPECT_RATIO = 9 / 20; // Matches source videos (720x1600)

type OnboardingSlideId = 'calendar' | 'shuffle' | 'mood';

interface OnboardingSlide {
  id: OnboardingSlideId;
  titleKey: string;
  descriptionKey: string;
  videoSource: number;
}

interface TranslatedOnboardingSlide extends OnboardingSlide {
  title: string;
  description: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'calendar',
    titleKey: 'onboarding.calendarTitle',
    descriptionKey: 'onboarding.calendarDescription',
    videoSource: require('@/assets/videos/calendar.mp4'),
  },
  {
    id: 'shuffle',
    titleKey: 'onboarding.shuffleTitle',
    descriptionKey: 'onboarding.shuffleDescription',
    videoSource: require('@/assets/videos/shuffle.mp4'),
  },
  {
    id: 'mood',
    titleKey: 'onboarding.moodTitle',
    descriptionKey: 'onboarding.moodDescription',
    videoSource: require('@/assets/videos/mood.mp4'),
  },
];

interface OnboardingSlideItemProps {
  item: TranslatedOnboardingSlide;
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  isActive: boolean;
  hasVideoError: boolean;
  fallbackLabel: string;
  onVideoError: (slideId: OnboardingSlideId) => void;
}

function OnboardingSlideItem({
  item,
  width,
  height,
  cardWidth,
  cardHeight,
  isActive,
  hasVideoError,
  fallbackLabel,
  onVideoError,
}: OnboardingSlideItemProps) {
  const player = useVideoPlayer(item.videoSource, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') {
        onVideoError(item.id);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [item.id, onVideoError, player]);

  useEffect(() => {
    if (hasVideoError) {
      player.pause();
      return;
    }

    if (isActive) {
      player.play();
      return;
    }

    player.pause();
  }, [hasVideoError, isActive, player]);

  return (
    <View style={[styles.slide, { width, height }]} testID={`onboarding-slide-${item.id}`}>
      <SafeAreaView style={styles.contentContainer}>
        <View style={styles.videoArea}>
          <View style={[styles.videoFrameWrapper, !isActive && styles.inactiveFrame]}>
            <View style={[styles.videoGlow, { width: cardWidth + 42, height: cardHeight + 42 }]} />
            <LinearGradient
              colors={['rgba(229,9,20,0.22)', 'rgba(0,0,0,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.videoFrameBorder,
                {
                  width: cardWidth + 2,
                  height: cardHeight + 2,
                  borderRadius: BORDER_RADIUS.xl + 10,
                },
              ]}
            />
            <View
              style={[
                styles.videoCard,
                {
                  width: cardWidth,
                  height: cardHeight,
                },
              ]}
            >
              {hasVideoError ? (
                <View style={styles.videoFallback} testID={`video-fallback-${item.id}`}>
                  <Film color={COLORS.textSecondary} size={30} />
                  <Text style={styles.fallbackText}>{fallbackLabel}</Text>
                </View>
              ) : (
                <VideoView
                  testID={`video-preview-${item.id}`}
                  player={player}
                  style={styles.video}
                  contentFit="cover"
                  nativeControls={false}
                  allowsFullscreen={false}
                  allowsPictureInPicture={false}
                />
              )}
            </View>
          </View>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlashListRef<TranslatedOnboardingSlide> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const isCompletingRef = useRef(false);
  const [videoErrorMap, setVideoErrorMap] = useState<Record<string, boolean>>({});
  const { completeOnboarding } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const maxCardWidth = Math.min(width * 0.74, 280);
  const maxCardHeight = height * 0.52;
  const cardWidth = Math.min(maxCardWidth, maxCardHeight * VIDEO_ASPECT_RATIO);
  const cardHeight = cardWidth / VIDEO_ASPECT_RATIO;

  const onboardingData = useMemo(
    () =>
      ONBOARDING_SLIDES.map((slide) => ({
        ...slide,
        title: t(slide.titleKey),
        description: t(slide.descriptionKey),
      })),
    [t]
  );

  const markVideoAsFailed = useCallback((slideId: OnboardingSlideId) => {
    setVideoErrorMap((prevState) => {
      if (prevState[slideId]) {
        return prevState;
      }
      return { ...prevState, [slideId]: true };
    });
  }, []);

  const finishOnboarding = useCallback(async () => {
    if (isCompletingRef.current) {
      return;
    }

    isCompletingRef.current = true;
    setIsCompleting(true);

    try {
      await completeOnboarding();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      console.error('Failed to complete onboarding', error);
      isCompletingRef.current = false;
      setIsCompleting(false);
    }
  }, [completeOnboarding, router]);

  const handleNext = useCallback(() => {
    if (currentIndex < onboardingData.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      return;
    }

    finishOnboarding();
  }, [currentIndex, finishOnboarding, onboardingData.length]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#090909', '#040404', '#000000']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.backgroundGlowTop} pointerEvents="none" />
      <View style={styles.backgroundGlowBottom} pointerEvents="none" />

      <FlashList
        ref={flatListRef}
        data={onboardingData}
        horizontal
        pagingEnabled
        bounces={false}
        extraData={[currentIndex, videoErrorMap]}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
          const clampedIndex = Math.max(0, Math.min(nextIndex, onboardingData.length - 1));
          setCurrentIndex(clampedIndex);
        }}
        renderItem={({ item, index }) => (
          <OnboardingSlideItem
            item={item}
            width={width}
            height={height}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            isActive={currentIndex === index}
            hasVideoError={Boolean(videoErrorMap[item.id])}
            fallbackLabel={t('onboarding.previewUnavailable')}
            onVideoError={markVideoAsFailed}
          />
        )}
        keyExtractor={(item) => item.id}
      />

      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity
          testID="onboarding-skip-button"
          onPress={finishOnboarding}
          style={styles.skipButton}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isCompleting}
        >
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <SafeAreaView style={styles.footer} pointerEvents="box-none">
        <View style={styles.pagination}>
          {onboardingData.map((slide, index) => (
            <View
              key={slide.id}
              testID={`pagination-dot-${index}`}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentIndex ? COLORS.primary : 'rgba(255, 255, 255, 0.35)',
                  width: index === currentIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          testID="onboarding-cta-button"
          onPress={handleNext}
          style={styles.nextButton}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isCompleting}
        >
          <Text style={styles.nextText}>
            {currentIndex === onboardingData.length - 1
              ? t('onboarding.getStarted')
              : t('common.next')}
          </Text>
          <ChevronRight color={COLORS.white} size={20} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 10,
    paddingTop: SPACING.xl,
  },
  videoArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  videoFrameWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveFrame: {
    opacity: 0.65,
    transform: [{ scale: 0.97 }],
  },
  videoGlow: {
    position: 'absolute',
    borderRadius: 40,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  videoFrameBorder: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.35)',
  },
  videoCard: {
    borderRadius: BORDER_RADIUS.xl + 8,
    overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 30,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    backgroundColor: '#0D0D0D',
    paddingHorizontal: SPACING.l,
  },
  fallbackText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  textContainer: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: -1.5,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: 'rgba(255, 255, 255, 0.78)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
    letterSpacing: -0.3,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.m,
    justifyContent: 'flex-end',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  dot: {
    height: 8,
    borderRadius: BORDER_RADIUS.round,
    marginHorizontal: 4,
  },
  topBar: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.l,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  skipButton: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.s,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: SPACING.s,
  },
  nextText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(229, 9, 20, 0.18)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -120,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(229, 9, 20, 0.14)',
  },
});
