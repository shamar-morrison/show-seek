import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import CastCrewScreen from '@/src/components/screens/CastCrewScreen';

export default function TVCastScreen() {
  const { id } = useLocalSearchParams();
  return <CastCrewScreen id={Number(id)} type="tv" />;
}
