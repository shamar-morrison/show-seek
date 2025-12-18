import PremiumScreen from '@/src/screens/PremiumScreen';
import { Stack } from 'expo-router';
import React from 'react';

export default function PremiumRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <PremiumScreen />
    </>
  );
}
