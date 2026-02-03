import React from 'react';
import { Stack } from 'expo-router';

export const CommonDetailScreens = () => (
  <>
    <Stack.Screen name="movie/[id]/index" options={{ title: '', headerTransparent: true }} />
    <Stack.Screen
      name="movie/[id]/cast"
      options={{ title: 'Cast & Crew', presentation: 'modal', gestureEnabled: true }}
    />
    <Stack.Screen name="tv/[id]/index" options={{ title: '', headerTransparent: true }} />
    <Stack.Screen
      name="tv/[id]/cast"
      options={{ title: 'Cast & Crew', presentation: 'modal', gestureEnabled: true }}
    />
    <Stack.Screen name="tv/[id]/seasons" options={{ title: 'Seasons' }} />
    <Stack.Screen
      name="tv/[id]/season/[seasonNum]/episode/[episodeNum]/index"
      options={{ title: '', headerTransparent: true, headerBackTitle: 'Season' }}
    />
    <Stack.Screen name="person/[id]/index" options={{ title: '', headerTransparent: true }} />
    <Stack.Screen name="collection/[id]/index" options={{ title: '', headerTransparent: true }} />
    <Stack.Screen name="review/[id]" options={{ title: '', headerTransparent: true }} />
  </>
);
