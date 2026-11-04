import { StremioHowItWorks } from '@/src/components/stremio/StremioHowItWorks';
import { SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Explains the Stremio integration. Opened from the info button on the Stremio screen. */
export default function StremioHowItWorksScreen() {
  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StremioHowItWorks />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
});
