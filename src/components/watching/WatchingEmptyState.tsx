import { COLORS } from '@/src/constants/theme';
import { Tv } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export const WatchingEmptyState = () => {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Tv size={48} color={COLORS.secondary} />
      </View>
      <Text style={styles.title}>No shows in progress</Text>
      <Text style={styles.message}>Start watching a show to see your progress tracked here.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 60,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceLight, // was surface.secondary
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text, // was text.primary
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary, // was text.secondary
    textAlign: 'center',
    lineHeight: 20,
  },
});
