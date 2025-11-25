import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/src/constants/theme';

import { SafeAreaView } from 'react-native-safe-area-context';

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.text}>Library Screen</Text>
    </SafeAreaView>
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
