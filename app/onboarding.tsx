import { GenreSelector } from '@/src/components/onboarding/GenreSelector';
import { PreferenceToggles } from '@/src/components/onboarding/PreferenceToggles';
import { ProviderSelector } from '@/src/components/onboarding/ProviderSelector';
import { WizardLayout } from '@/src/components/onboarding/WizardLayout';
import { DEFAULT_HOME_LISTS } from '@/src/constants/homeScreenLists';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { preferencesService } from '@/src/services/PreferencesService';
import { HomeScreenListItem, UserPreferences } from '@/src/types/preferences';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

type ContentType = 'movie' | 'tv' | 'both';

interface OnboardingData {
  contentType: ContentType;
  genres: number[];
  providers: number[];
  blurPlotSpoilers: boolean;
  dataSaver: boolean;
}

const TOTAL_STEPS = 4;

// Generate home screen lists based on content preference
function generateHomeScreenLists(contentType: ContentType): HomeScreenListItem[] {
  switch (contentType) {
    case 'movie':
      return [
        { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
        { id: 'popular-movies', type: 'tmdb', label: 'Popular Movies' },
        { id: 'upcoming-movies', type: 'tmdb', label: 'Upcoming Movies' },
        { id: 'top-rated-movies', type: 'tmdb', label: 'Top Rated' },
      ];
    case 'tv':
      return [
        { id: 'trending-tv', type: 'tmdb', label: 'Trending TV Shows' },
        { id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' },
        { id: 'popular-tv', type: 'tmdb', label: 'Popular TV Shows' },
        { id: 'top-rated-tv', type: 'tmdb', label: 'Top Rated TV Shows' },
      ];
    case 'both':
    default:
      return DEFAULT_HOME_LISTS;
  }
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    contentType: 'both',
    genres: [],
    providers: [],
    blurPlotSpoilers: false,
    dataSaver: false,
  });

  const handleNext = async () => {
    if (isSaving) return;
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await completeOnboarding();
    }
  };

  const handleBack = () => {
    if (isSaving) return;
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = async () => {
    if (isSaving) return;
    // Skip this step with default values and move to next
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await completeOnboarding();
    }
  };

  const completeOnboarding = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      // Generate home screen lists based on content preference
      const homeScreenLists = generateHomeScreenLists(data.contentType);

      // Prepare preferences to save
      const preferencesToSave: Partial<UserPreferences> = {
        onboardingCompleted: true,
        favoriteGenres: data.genres,
        watchProviders: data.providers,
        preferredContentTypes: data.contentType,
        blurPlotSpoilers: data.blurPlotSpoilers,
        dataSaver: data.dataSaver,
        homeScreenLists,
      };

      // Save all preferences at once
      await preferencesService.updatePreferences(preferencesToSave);

      // Invalidate preferences cache
      queryClient.invalidateQueries({ queryKey: ['preferences'] });

      // Navigate to home
      router.replace({ pathname: '/(tabs)/home' });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setSaveError(
        t(
          'onboarding.saveError',
          'We could not save your preferences. Please check your connection and try again.',
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep />;
      case 1:
        return (
          <ContentGenreStep
            contentType={data.contentType}
            selectedGenres={data.genres}
            onContentTypeChange={(contentType) => setData({ ...data, contentType })}
            onGenresChange={(genres) => setData({ ...data, genres })}
          />
        );
      case 2:
        return (
          <ProviderSelector
            selectedProviders={data.providers}
            onSelectionChange={(providers) => setData({ ...data, providers })}
            maxProviders={5}
          />
        );
      case 3:
        return (
          <PreferenceToggles
            blurPlotSpoilers={data.blurPlotSpoilers}
            dataSaver={data.dataSaver}
            onBlurPlotSpoilersChange={(value) => setData({ ...data, blurPlotSpoilers: value })}
            onDataSaverChange={(value) => setData({ ...data, dataSaver: value })}
          />
        );
      default:
        return null;
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 0:
        return t('onboarding.welcome');
      case 1:
        return t('onboarding.whatDoYouWatch');
      case 2:
        return t('onboarding.streamingServices');
      case 3:
        return t('onboarding.appExperience');
      default:
        return '';
    }
  };

  const getStepSubtitle = () => {
    switch (currentStep) {
      case 0:
        return t('onboarding.letsPersonalize');
      case 1:
        return t('onboarding.selectGenresHint');
      case 2:
        return t('onboarding.selectProvidersHint');
      case 3:
        return t('onboarding.customizeExperienceHint');
      default:
        return '';
    }
  };

  return (
    <WizardLayout
      currentStep={currentStep}
      totalSteps={TOTAL_STEPS}
      title={getStepTitle()}
      subtitle={getStepSubtitle()}
      onNext={handleNext}
      onBack={handleBack}
      onSkip={handleSkip}
      isFirstStep={currentStep === 0}
      isLastStep={currentStep === TOTAL_STEPS - 1}
      nextDisabled={isSaving}
    >
      {saveError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      ) : null}
      {renderStepContent()}
    </WizardLayout>
  );
}

// Step 0: Welcome
function WelcomeStep() {
  const { t } = useTranslation();

  return (
    <View style={styles.welcomeContainer}>
      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.welcomeContent}>
        <Text style={styles.welcomeEmoji}>🎬</Text>
        <Text style={styles.welcomeTitle}>{t('onboarding.welcomeTitle')}</Text>
        <Text style={styles.welcomeDescription}>{t('onboarding.welcomeDescription')}</Text>
      </Animated.View>
    </View>
  );
}

// Step 1: Content Type + Genres
interface ContentGenreStepProps {
  contentType: ContentType;
  selectedGenres: number[];
  onContentTypeChange: (type: ContentType) => void;
  onGenresChange: (genres: number[]) => void;
}

function ContentGenreStep({
  contentType,
  selectedGenres,
  onContentTypeChange,
  onGenresChange,
}: ContentGenreStepProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.contentGenreContainer}>
      {/* Content Type Selection */}
      <View style={styles.contentTypeSection}>
        <Text style={styles.sectionLabel}>{t('onboarding.preferredContent')}</Text>
        <View style={styles.contentTypeButtons}>
          {(['movie', 'tv', 'both'] as ContentType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.contentTypeButton,
                contentType === type && styles.contentTypeButtonActive,
              ]}
              onPress={() => onContentTypeChange(type)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text
                style={[
                  styles.contentTypeText,
                  contentType === type && styles.contentTypeTextActive,
                ]}
              >
                {type === 'movie'
                  ? t('media.movies')
                  : type === 'tv'
                    ? t('media.tvShows')
                    : t('onboarding.both')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Genre Selection */}
      <View style={styles.genreSection}>
        <Text style={styles.sectionLabel}>{t('onboarding.favoriteGenres')}</Text>
        <GenreSelector selectedGenres={selectedGenres} onSelectionChange={onGenresChange} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Welcome step
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  welcomeEmoji: {
    fontSize: 80,
    marginBottom: SPACING.xl,
  },
  welcomeTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  welcomeDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorBanner: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    marginBottom: SPACING.l,
    padding: SPACING.m,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
  },

  // Content + Genre step
  contentGenreContainer: {
    flex: 1,
  },
  contentTypeSection: {
    marginBottom: SPACING.l,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contentTypeButtons: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  contentTypeButton: {
    flex: 1,
    paddingVertical: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  contentTypeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  contentTypeText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  contentTypeTextActive: {
    color: COLORS.white,
  },
  genreSection: {
    flex: 1,
  },
});
