import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useRegion } from '@/src/context/RegionProvider';
import { onboardingService } from '@/src/services/OnboardingService';
import { ONBOARDING_STEPS, EMPTY_ONBOARDING_SELECTIONS } from '@/src/types/onboarding';
import type { OnboardingSelections, OnboardingStepId } from '@/src/types/onboarding';
import type { HomeScreenListItem } from '@/src/types/preferences';
import type { Movie, Person, TVShow } from '@/src/api/tmdb';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import RegionStep from './RegionStep';
import DisplayNameStep from './DisplayNameStep';
import StreamingProvidersStep from './StreamingProvidersStep';
import FavoriteListsStep from './FavoriteListsStep';
import TVShowsStep from './TVShowsStep';
import MoviesStep from './MoviesStep';
import ActorsStep from './ActorsStep';
import AccentColorStep from './AccentColorStep';
import PersonalizingScreen from './PersonalizingScreen';
import { ChevronLeft } from 'lucide-react-native';

export default function OnboardingContainer() {
  const { t } = useTranslation();
  const router = useRouter();
  const { completePersonalOnboarding } = useAuth();
  const { setRegion } = useRegion();
  const { setAccentColor } = useAccentColor();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selections, setSelections] = useState<OnboardingSelections>({
    ...EMPTY_ONBOARDING_SELECTIONS,
  });
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  const progressWidth = useSharedValue(0);

  const totalSteps = ONBOARDING_STEPS.length;
  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;

  // Determine accent color for UI (use selected or default)
  const displayAccentColor = selections.accentColor || COLORS.primary;

  // Animated progress bar style
  const progressAnimStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  // Update progress bar whenever step changes
  const updateProgress = useCallback(
    (stepIndex: number) => {
      const pct = ((stepIndex + 1) / totalSteps) * 100;
      progressWidth.value = withTiming(pct, { duration: 300 });
    },
    [progressWidth, totalSteps]
  );

  const handleRegionSelect = useCallback(
    (regionCode: string) => {
      setSelections((prev) => ({ ...prev, region: regionCode }));
      setRegion(regionCode);
    },
    [setRegion]
  );

  const handleListsSelect = useCallback((lists: HomeScreenListItem[]) => {
    setSelections((prev) => ({ ...prev, homeScreenLists: lists }));
  }, []);

  const handleTVShowsSelect = useCallback((shows: TVShow[]) => {
    setSelections((prev) => ({ ...prev, selectedTVShows: shows }));
  }, []);

  const handleMoviesSelect = useCallback((movies: Movie[]) => {
    setSelections((prev) => ({ ...prev, selectedMovies: movies }));
  }, []);

  const handleActorsSelect = useCallback((actors: Person[]) => {
    setSelections((prev) => ({ ...prev, selectedActors: actors }));
  }, []);

  const handleAccentColorSelect = useCallback((color: string) => {
    setSelections((prev) => ({ ...prev, accentColor: color }));
  }, []);

  const handleDisplayNameChange = useCallback((name: string) => {
    setSelections((prev) => ({ ...prev, displayName: name }));
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      // Apply accent color if selected
      if (selections.accentColor) {
        setAccentColor(selections.accentColor);
      }
      setIsPersonalizing(true);
      return;
    }

    const nextIndex = currentStepIndex + 1;
    setCurrentStepIndex(nextIndex);
    updateProgress(nextIndex);
  }, [currentStepIndex, isLastStep, selections.accentColor, setAccentColor, updateProgress]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleBack = useCallback(() => {
    if (isFirstStep) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    updateProgress(prevIndex);
  }, [currentStepIndex, isFirstStep, updateProgress]);

  const handlePersonalizingComplete = useCallback(async () => {
    try {
      await onboardingService.saveOnboarding(selections);
    } catch (e) {
      console.error('[OnboardingContainer] Save failed:', e);
    }

    await completePersonalOnboarding();
    router.replace('/(tabs)/home' as any);
  }, [completePersonalOnboarding, router, selections]);

  // Initialize progress on first render
  React.useEffect(() => {
    updateProgress(0);
  }, [updateProgress]);

  // Check if there's a meaningful selection for the current step
  const hasSelection = useMemo(() => {
    switch (currentStep?.id) {
      case 'region':
        return selections.region !== null;
      case 'display-name':
        return true; // Allow continuing even with empty name (fallback to Auth name)
      case 'streaming-providers':
        return true; // Always allow continuing — this step is purely aesthetic
      case 'favorite-lists':
        return selections.homeScreenLists.length > 0;
      case 'tv-shows':
        return selections.selectedTVShows.length > 0;
      case 'movies':
        return selections.selectedMovies.length > 0;
      case 'actors':
        return selections.selectedActors.length > 0;
      case 'accent-color':
        return selections.accentColor !== null;
      default:
        return false;
    }
  }, [currentStep?.id, selections]);

  if (isPersonalizing) {
    return <PersonalizingScreen onComplete={handlePersonalizingComplete} />;
  }

  const renderStep = () => {
    switch (currentStep?.id) {
      case 'region':
        return (
          <RegionStep
            selectedRegion={selections.region}
            onSelect={handleRegionSelect}
          />
        );
      case 'display-name':
        return (
          <DisplayNameStep
            displayName={selections.displayName}
            onChangeDisplayName={handleDisplayNameChange}
          />
        );
      case 'streaming-providers':
        return <StreamingProvidersStep />;
      case 'favorite-lists':
        return (
          <FavoriteListsStep
            selectedLists={selections.homeScreenLists}
            onSelect={handleListsSelect}
          />
        );
      case 'tv-shows':
        return (
          <TVShowsStep
            selectedShows={selections.selectedTVShows}
            onSelect={handleTVShowsSelect}
          />
        );
      case 'movies':
        return (
          <MoviesStep
            selectedMovies={selections.selectedMovies}
            onSelect={handleMoviesSelect}
          />
        );
      case 'actors':
        return (
          <ActorsStep
            selectedActors={selections.selectedActors}
            onSelect={handleActorsSelect}
          />
        );
      case 'accent-color':
        return (
          <AccentColorStep
            selectedColor={selections.accentColor}
            onSelect={handleAccentColorSelect}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { backgroundColor: displayAccentColor },
              progressAnimStyle,
            ]}
          />
        </View>
        <Text style={styles.stepIndicator}>
          {currentStepIndex + 1}/{totalSteps}
        </Text>
      </View>

      {/* Step Content */}
      <Animated.View
        key={currentStep?.id}
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(150)}
        style={styles.stepContent}
      >
        {renderStep()}
      </Animated.View>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {!isFirstStep && (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <ChevronLeft size={20} color={COLORS.textSecondary} />
            <Text style={styles.backText}>{t('personalOnboarding.back')}</Text>
          </Pressable>
        )}

        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>{t('personalOnboarding.skip')}</Text>
        </Pressable>

        <Pressable
          style={[
            styles.continueButton,
            { backgroundColor: displayAccentColor },
            !hasSelection && styles.continueButtonDisabled,
          ]}
          onPress={hasSelection ? handleNext : undefined}
          disabled={!hasSelection}
        >
          <Text style={styles.continueText}>
            {isLastStep ? t('personalOnboarding.letsGo') : t('personalOnboarding.continue')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.s,
    paddingBottom: SPACING.m,
    gap: SPACING.s,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.round,
  },
  stepIndicator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },
  stepContent: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    gap: SPACING.m,
  },
  skipButton: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.s,
  },
  skipText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    gap: 2,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
});
