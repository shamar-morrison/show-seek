import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, useWindowDimensions, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/context/auth';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const ONBOARDING_DATA = [
  {
    id: '1',
    title: 'Welcome to ShowSeek',
    description: 'Your Personal Movie & TV Show Companion. Discover, track, and enjoy.',
    image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: '2',
    title: 'Discover Content',
    description: 'Browse thousands of movies and TV shows. Trending, popular, and top rated.',
    image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1000&auto=format&fit=crop',
  },
  {
    id: '3',
    title: 'Track Favorites',
    description: 'Save your favorites and rate what you watch. Keep track of everything in one place.',
    image: 'https://images.unsplash.com/photo-1517604931442-71053e3e2c28?q=80&w=1000&auto=format&fit=crop',
  },
];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { completeOnboarding } = useAuth();
  const router = useRouter();

  const handleNext = () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
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
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_DATA}
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
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.description}</Text>
                </View>
              </SafeAreaView>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />

      <SafeAreaView style={styles.footer} pointerEvents="box-none">
        <View style={styles.pagination}>
          {ONBOARDING_DATA.map((_, index) => (
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
           <TouchableOpacity onPress={finishOnboarding} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
           </TouchableOpacity>

           <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextText}>
                {currentIndex === ONBOARDING_DATA.length - 1 ? 'Get Started' : 'Next'}
              </Text>
           </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  slide: {
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 100, // Space for footer
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
});
