import { BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { Search, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SearchableHeaderProps {
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Callback when search is closed/cleared */
  onClose: () => void;
  /** Placeholder text for the search input */
  placeholder?: string;
}

/**
 * A header component that displays a full-width search bar.
 * Used to replace the normal header when search mode is active.
 * Includes a fade-in animation and auto-focus.
 */
export function SearchableHeader({
  searchQuery,
  onSearchChange,
  onClose,
  placeholder = 'Search...',
}: SearchableHeaderProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  // Fade in on mount and auto-focus
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Focus after animation completes
      inputRef.current?.focus();
    });
  }, [opacity]);

  const handleClear = () => {
    // Fade out before closing
    Animated.timing(opacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + SPACING.s,
          opacity,
        },
      ]}
    >
      <View style={styles.searchContainer}>
        <Search size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={COLORS.primary}
        />
        <Pressable onPress={handleClear} hitSlop={HIT_SLOP.l} style={styles.clearButton}>
          <X size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    height: 40,
  },
  searchIcon: {
    marginRight: SPACING.s,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    padding: 0,
  },
  clearButton: {
    marginLeft: SPACING.s,
  },
});
