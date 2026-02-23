import { Stack } from 'expo-router';
import React from 'react';

export const CommonDetailScreens = () => (
  <>
    <Stack.Screen
      name="movie/[id]/index"
      options={{ title: '', headerTransparent: true, headerShown: true }}
    />
    <Stack.Screen
      name="movie/[id]/cast"
      options={{
        title: 'Cast & Crew',
        presentation: 'modal',
        gestureEnabled: true,
        headerShown: true,
      }}
    />
    <Stack.Screen
      name="movie/[id]/poster-picker"
      options={{ title: 'Poster', headerShown: false, presentation: 'modal', gestureEnabled: true }}
    />
    <Stack.Screen
      name="tv/[id]/index"
      options={{ title: '', headerTransparent: true, headerShown: true }}
    />
    <Stack.Screen
      name="tv/[id]/cast"
      options={{
        title: 'Cast & Crew',
        presentation: 'modal',
        gestureEnabled: true,
        headerShown: true,
      }}
    />
    <Stack.Screen
      name="tv/[id]/poster-picker"
      options={{ title: 'Poster', headerShown: false, presentation: 'modal', gestureEnabled: true }}
    />
    <Stack.Screen name="tv/[id]/seasons" options={{ title: 'Seasons', headerShown: true }} />
    <Stack.Screen
      name="tv/[id]/season/[seasonNum]/episode/[episodeNum]/index"
      options={{ title: '', headerTransparent: true, headerBackTitle: 'Season', headerShown: true }}
    />
    <Stack.Screen
      name="person/[id]/index"
      options={{ title: '', headerTransparent: true, headerShown: true }}
    />
    <Stack.Screen name="person/[id]/credits" options={{ headerShown: true }} />
    <Stack.Screen
      name="collection/[id]/index"
      options={{ title: '', headerTransparent: true, headerShown: true }}
    />
    <Stack.Screen
      name="review/[id]"
      options={{ title: '', headerTransparent: true, headerShown: true }}
    />
  </>
);
