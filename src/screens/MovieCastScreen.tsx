import CastCrewScreen from '@/src/screens/CastCrewScreen';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function MovieCastScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  return <CastCrewScreen id={Number(id)} type="movie" mediaTitle={title} />;
}
