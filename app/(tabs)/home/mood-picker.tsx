import { getRandomMood, MOODS, type MoodConfig } from '@/src/constants/moods';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Shuffle } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MoodCardProps {
  mood: MoodConfig;
  index: number;
  onPress: (moodId: string) => void;
}

/**
 * Individual mood card with animated entrance.
 */
function MoodCard({ mood, index, onPress }: MoodCardProps) {
  const { t } = useTranslation();
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  // Staggered entrance animation
  React.useEffect(() => {
    const delay = index * 80;
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
  }, [index, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withTiming(1, { duration: 100 })
    );
    onPress(mood.id);
  };

  // Extract translation keys from mood.translationKey (e.g., 'mood.cozy')
  const moodKey = mood.translationKey.replace('mood.', '');
  const nameKey = `mood.${moodKey}.name`;
  const descKey = `mood.${moodKey}.description`;

  return (
    <AnimatedPressable
      style={[styles.moodCard, { backgroundColor: mood.color + '20' }, animatedStyle]}
      onPress={handlePress}
    >
      <Text style={styles.moodEmoji}>{mood.emoji}</Text>
      <Text style={styles.moodName}>{t(nameKey)}</Text>
      <Text style={styles.moodDescription}>{t(descKey)}</Text>
    </AnimatedPressable>
  );
}

/**
 * Mood Picker screen for selecting a mood to discover content.
 */
export default function MoodPickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const [isSpinning, setIsSpinning] = useState(false);
  const surpriseRotation = useSharedValue(0);

  const handleMoodSelect = useCallback(
    (moodId: string) => {
      router.push({
        pathname: '/(tabs)/home/mood-results',
        params: { moodId },
      });
    },
    [router]
  );

  const navigateToRandomMood = useCallback(() => {
    const randomMood = getRandomMood();
    handleMoodSelect(randomMood.id);
  }, [handleMoodSelect]);

  const handleSurpriseMe = () => {
    if (isSpinning) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsSpinning(true);

    // Spin animation then navigate
    surpriseRotation.value = withSequence(
      withTiming(360 * 3, { duration: 800 }),
      withTiming(0, { duration: 0 })
    );

    // Navigate after animation
    setTimeout(() => {
      setIsSpinning(false);
      navigateToRandomMood();
    }, 850);
  };

  const surpriseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${surpriseRotation.value}deg` }],
  }));

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('mood.title')}</Text>
          <Text style={styles.subtitle}>{t('mood.subtitle')}</Text>
        </View>

        {/* Mood Grid */}
        <View style={styles.moodGrid}>
          {MOODS.map((mood, index) => (
            <MoodCard key={mood.id} mood={mood} index={index} onPress={handleMoodSelect} />
          ))}
        </View>

        {/* Surprise Me Button */}
        <Pressable
          style={[styles.surpriseButton, { backgroundColor: accentColor }]}
          onPress={handleSurpriseMe}
          disabled={isSpinning}
        >
          <Animated.View style={surpriseAnimatedStyle}>
            <Shuffle size={24} color={COLORS.text} />
          </Animated.View>
          <Text style={styles.surpriseButtonText}>{t('mood.surpriseMe')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.l,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.m,
  },
  moodCard: {
    width: '47%',
    padding: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 130,
  },
  moodEmoji: {
    fontSize: 40,
    marginBottom: SPACING.s,
  },
  moodName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  moodDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  surpriseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    marginTop: SPACING.xl,
  },
  surpriseButtonText: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.text,
  },
});
