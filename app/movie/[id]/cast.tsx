import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import CastCrewScreen from '@/src/components/screens/CastCrewScreen';

export default function MovieCastScreen() {
  const { id } = useLocalSearchParams();
  return <CastCrewScreen id={Number(id)} type="movie" />;
}
