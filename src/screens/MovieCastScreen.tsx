import CastCrewScreen from '@/src/components/screens/CastCrewScreen';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function MovieCastScreen() {
  const { id } = useLocalSearchParams();
  return <CastCrewScreen id={Number(id)} type="movie" />;
}
