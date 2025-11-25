
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/src/constants/theme';

export default function MovieDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Movie Detail</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: COLORS.text,
    fontSize: 16,
  },
});
