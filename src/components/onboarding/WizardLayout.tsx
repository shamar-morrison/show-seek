import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface WizardLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  title?: string;
  subtitle?: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  isLastStep?: boolean;
  isFirstStep?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
}

export function WizardLayout({
  children,
  currentStep,
  totalSteps,
  title,
  subtitle,
  onNext,
  onBack,
  onSkip,
  isLastStep = false,
  isFirstStep = false,
  nextDisabled = false,
  nextLabel,
}: WizardLayoutProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Progress indicator */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index <= currentStep && styles.progressDotActive,
                index < currentStep && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepIndicator}>
          {currentStep + 1} / {totalSteps}
        </Text>
      </View>

      {/* Header */}
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}

      {/* Content */}
      <Animated.View
        style={styles.content}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
      >
        {children}
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {!isFirstStep && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backButton}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.backText}>{t('common.back')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={onSkip} style={styles.skipButton} activeOpacity={ACTIVE_OPACITY}>
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNext}
          style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
          activeOpacity={ACTIVE_OPACITY}
          disabled={nextDisabled}
        >
          <Text style={[styles.nextText, nextDisabled && styles.nextTextDisabled]}>
            {nextLabel || (isLastStep ? t('common.done') : t('common.next'))}
          </Text>
        </TouchableOpacity>
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
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    gap: SPACING.m,
  },
  progressBar: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  progressDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.surfaceLight,
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
  },
  progressDotCompleted: {
    backgroundColor: COLORS.primary,
    opacity: 0.6,
  },
  stepIndicator: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.s,
  },
  subtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  footerLeft: {
    flex: 1,
  },
  backButton: {
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
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
    marginLeft: SPACING.m,
  },
  nextButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  nextText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  nextTextDisabled: {
    color: COLORS.textSecondary,
  },
});
