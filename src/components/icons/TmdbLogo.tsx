/**
 * TMDB Logo Component
 *
 * Renders the TMDB logo from the bundled PNG asset.
 * Mirrors the TraktLogo API so detail section headers stay consistent.
 */

import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface TmdbLogoProps {
  size?: number;
}

export function TmdbLogo({ size = 24 }: TmdbLogoProps) {
  return (
    <Image
      source={require('@/assets/images/tmdb.png')}
      style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }]}
      resizeMode="contain"
      accessibilityLabel="TMDB logo"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: '#000',
  },
});
