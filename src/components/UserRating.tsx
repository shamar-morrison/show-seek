import { Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT_SIZE, SPACING } from '../constants/theme';
import { getRatingText } from '../utils/ratingHelpers';

interface UserRatingProps {
  rating: number;
}

export default function UserRating({ rating }: UserRatingProps) {
  if (!rating) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Your Rating:</Text>
      <View style={styles.ratingContent}>
        <Star size={16} color={COLORS.primary} fill={COLORS.primary} />
        <Text style={styles.ratingText}>
          {rating}/10 - <Text style={styles.description}>{getRatingText(rating)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.l,
  },
  label: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  ratingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  description: {
    color: COLORS.textSecondary,
    fontWeight: 'normal',
  },
});
