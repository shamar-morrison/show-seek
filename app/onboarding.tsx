import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { screenStyles } from '@/src/styles/screenStyles';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingSlide {
  id: string;
  titleKey: string;
  descriptionKey: string;
  image: string;
  showTraktLogo?: boolean;
  // Added by translation mapping
  title?: string;
  description?: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    titleKey: 'onboarding.welcome',
    descriptionKey: 'onboarding.welcomeDescription',
    image:
      'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: '2',
    titleKey: 'onboarding.discoverTitle',
    descriptionKey: 'onboarding.discoverDescription',
    image:
      'https://images.unsplash.com/photo-1615986201152-7686a4867f30?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: '3',
    titleKey: 'onboarding.trackTitle',
    descriptionKey: 'onboarding.trackDescription',
    image:
      'https://images.unsplash.com/photo-1584905066893-7d5c142ba4e1?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: '4',
    titleKey: 'profile.traktIntegration',
    descriptionKey: 'trakt.connectToSync',
    image:
      'https://images.unsplash.com/photo-1423666639041-f56000c27a9a?q=80&w=1000&auto=format&fit=crop',
    showTraktLogo: true,
  },
];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlashListRef<OnboardingSlide> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { completeOnboarding } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  // Memoize translated data to avoid re-rendering on every frame
  const onboardingData = useMemo(
    () =>
      ONBOARDING_SLIDES.map((slide) => ({
        ...slide,
        title: t(slide.titleKey),
        description: t(slide.descriptionKey),
      })),
    [t]
  );

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      finishOnboarding();
    }
  };

  const finishOnboarding = async () => {
    await completeOnboarding();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={screenStyles.container}>
      <FlashList
        ref={flatListRef}
        data={onboardingData}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={(event) => {
          setCurrentIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, height }]}>
            <Image
              source={{ uri: item.image }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']}
              style={StyleSheet.absoluteFillObject}
            />
            <SafeAreaView style={styles.contentContainer}>
              <View style={styles.textContainer}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.showTraktLogo && (
                    <View style={styles.logoContainer}>
                      <TraktLogo size={32} />
                    </View>
                  )}
                </View>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </SafeAreaView>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      <SafeAreaView style={styles.footer} pointerEvents="box-none">
        <View style={styles.pagination}>
          {onboardingData.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index === currentIndex ? COLORS.primary : COLORS.textSecondary,
                  width: index === currentIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            onPress={finishOnboarding}
            style={styles.skipButton}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.skipText}>{t('common.skip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNext}
            style={styles.nextButton}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.nextText}>
              {currentIndex === onboardingData.length - 1
                ? t('onboarding.getStarted')
                : t('common.next')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 180, // Space for footer and pagination
    width: '100%',
  },
  textContainer: {
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.l,
    justifyContent: 'flex-end',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    padding: SPACING.m,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.round,
  },
  nextText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.m,
  },
  logoContainer: {
    marginLeft: SPACING.s,
    top: -6,
  },
});
