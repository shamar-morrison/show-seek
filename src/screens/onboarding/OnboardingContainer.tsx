import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useLanguage } from '@/src/context/LanguageProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useRegion } from '@/src/context/RegionProvider';
import { onboardingService } from '@/src/services/OnboardingService';
import { ONBOARDING_STEPS, EMPTY_ONBOARDING_SELECTIONS } from '@/src/types/onboarding';
import type { OnboardingSelections } from '@/src/types/onboarding';
import type { HomeScreenListItem } from '@/src/types/preferences';
import type { Movie, Person, TVShow } from '@/src/api/tmdb';
import type { SupportedLanguageCode } from '@/src/constants/supportedLanguages';
import { seedHomeScreenListsCache } from '@/src/utils/preferencesCache';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import GenresStep from './GenresStep';
import LanguagesStep from './LanguagesStep';
import TVShowsStep from './TVShowsStep';
import MoviesStep from './MoviesStep';
import ActorsStep from './ActorsStep';
import AccentColorStep from './AccentColorStep';
import OnboardingPaywallStep from './OnboardingPaywallStep';
import PersonalizingScreen from './PersonalizingScreen';
import WelcomeIntroScreen from './WelcomeIntroScreen';
import { ChevronLeft } from 'lucide-react-native';

export default function OnboardingContainer() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, completePersonalOnboarding } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { setRegion } = useRegion();
  const { setAccentColor } = useAccentColor();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const queryClient = useQueryClient();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selections, setSelections] = useState<OnboardingSelections>(() => ({
    ...EMPTY_ONBOARDING_SELECTIONS,
    language,
  }));
  const [selectedViaOther, setSelectedViaOther] = useState(false);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const saveOnboardingPromiseRef = useRef<Promise<void> | null>(null);

  const progressWidth = useSharedValue(0);

  const totalSteps = ONBOARDING_STEPS.length;
  const currentStep = ONBOARDING_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;
  const paywallDisplayName = resolvePreferredDisplayName(
    selections.displayName,
    user?.displayName,
    user?.email
  );

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
    (regionCode: string, options?: { viaOther?: boolean }) => {
      setSelections((prev) => ({ ...prev, region: regionCode }));
      setSelectedViaOther(Boolean(options?.viaOther));
      setRegion(regionCode);
    },
    [setRegion]
  );

  const handleListsSelect = useCallback((lists: HomeScreenListItem[]) => {
    setSelections((prev) => ({ ...prev, homeScreenLists: lists }));
  }, []);

  const handleLanguageSelect = useCallback(
    async (languageCode: SupportedLanguageCode) => {
      await setLanguage(languageCode, { syncToFirebase: false });
      setSelections((prev) => ({ ...prev, language: languageCode }));
    },
    [setLanguage]
  );

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

  const handleGenresSelect = useCallback((genreIds: number[]) => {
    setSelections((prev) => ({ ...prev, selectedGenreIds: genreIds }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep?.id === 'accent-color' && selections.accentColor) {
      setAccentColor(selections.accentColor);
    }

    if (isLastStep) {
      setIsPersonalizing(true);
      return;
    }

    const nextIndex = currentStepIndex + 1;
    setCurrentStepIndex(nextIndex);
    updateProgress(nextIndex);
  }, [
    currentStep?.id,
    currentStepIndex,
    isLastStep,
    selections.accentColor,
    setAccentColor,
    updateProgress,
  ]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handleBack = useCallback(() => {
    if (isFirstStep) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    updateProgress(prevIndex);
  }, [currentStepIndex, isFirstStep, updateProgress]);

  const handleSaveOnboarding = useCallback(() => {
    const savePromise =
      saveOnboardingPromiseRef.current ?? onboardingService.saveOnboarding(selections);
    saveOnboardingPromiseRef.current = savePromise;

    return savePromise;
  }, [selections]);

  const handlePersonalizingDone = useCallback(async () => {
    try {
      await handleSaveOnboarding();
    } catch {
      return;
    }

    seedHomeScreenListsCache(queryClient, user?.uid, selections.homeScreenLists);

    try {
      await completePersonalOnboarding();
      router.replace('/(tabs)/home' as any);
    } catch (e) {
      console.error('[OnboardingContainer] Personal onboarding completion failed:', e);
    }
  }, [completePersonalOnboarding, handleSaveOnboarding, queryClient, router, selections.homeScreenLists, user?.uid]);

  // Initialize progress on first render
  React.useEffect(() => {
    updateProgress(0);
  }, [updateProgress]);

  React.useEffect(() => {
    setSelections((prev) => (prev.language === language ? prev : { ...prev, language }));
  }, [language]);

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
      case 'languages':
        return Boolean(selections.language);
      case 'genres':
        return selections.selectedGenreIds.length > 0;
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

  React.useEffect(() => {
    if (
      !isPersonalizing &&
      !isPremiumLoading &&
      currentStep?.id === 'premium-paywall' &&
      isPremium
    ) {
      setIsPersonalizing(true);
    }
  }, [currentStep?.id, isPersonalizing, isPremium, isPremiumLoading]);

  if (showWelcome) {
    return <WelcomeIntroScreen onComplete={() => setShowWelcome(false)} />;
  }

  if (isPersonalizing) {
    return (
      <PersonalizingScreen onComplete={handleSaveOnboarding} onDone={handlePersonalizingDone} />
    );
  }

  if (currentStep?.id === 'premium-paywall') {
    return <OnboardingPaywallStep displayName={paywallDisplayName} onClose={handleNext} />;
  }

  const renderStep = () => {
    switch (currentStep?.id) {
      case 'region':
        return (
          <RegionStep
            selectedRegion={selections.region}
            selectedViaOther={selectedViaOther}
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
      case 'languages':
        return (
          <LanguagesStep
            selectedLanguage={selections.language}
            onSelect={handleLanguageSelect}
          />
        );
      case 'genres':
        return (
          <GenresStep
            selectedGenreIds={selections.selectedGenreIds}
            onSelect={handleGenresSelect}
          />
        );
      case 'tv-shows':
        return (
          <TVShowsStep selectedShows={selections.selectedTVShows} onSelect={handleTVShowsSelect} />
        );
      case 'movies':
        return (
          <MoviesStep
            selectedMovies={selections.selectedMovies}
            onSelect={handleMoviesSelect}
            genreIds={selections.selectedGenreIds}
          />
        );
      case 'actors':
        return (
          <ActorsStep selectedActors={selections.selectedActors} onSelect={handleActorsSelect} />
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
