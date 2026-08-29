import OnboardingContainer from '@/src/screens/onboarding/OnboardingContainer';
import { useLocalSearchParams } from 'expo-router';

export default function PersonalizedOnboardingScreen() {
  const { step } = useLocalSearchParams<{ step?: string }>();
  const initialStepIndex = step ? Number(step) : undefined;

  return <OnboardingContainer initialStepIndex={initialStepIndex} />;
}
