import { ACTIVE_OPACITY, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ArrowLeft } from 'lucide-react-native';
import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AnimatedScrollHeaderProps {
  title: string;
  subtitle?: string;
  onBackPress: () => void;
  scrollY: Animated.Value;
  rightAction?: React.ReactNode;
}

export function AnimatedScrollHeader({
  title,
  subtitle,
  onBackPress,
  scrollY,
  rightAction,
}: AnimatedScrollHeaderProps) {
  const SCROLL_THRESHOLD = 175;
  const HEADER_HEIGHT = 56;

  // Slide animation: header starts above viewport, slides down when scrolling
  const headerTranslateY = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 30, SCROLL_THRESHOLD],
    outputRange: [-HEADER_HEIGHT, 0],
    extrapolate: 'clamp',
  });

  // Opacity animation: fade in as header slides down
  const headerOpacity = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD - 20, SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.header,
        {
          transform: [{ translateY: headerTranslateY }],
          opacity: headerOpacity,
        },
      ]}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.backButton}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                {subtitle}
              </Text>
            )}
          </View>
          {rightAction ? (
            <View style={styles.rightAction}>{rightAction}</View>
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: COLORS.black,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  safeArea: {
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: SPACING.m,
  },
  backButton: {
    padding: SPACING.s,
    marginRight: SPACING.s,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  spacer: {
    width: 48, // Balance layout (same as back button width)
  },
  rightAction: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
