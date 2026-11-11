import { MediaImage } from '@/src/components/ui/MediaImage';
import { type ProfileBackground, getProfileBackgroundUrl } from '@/src/utils/profileBackground';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface ProfileBackgroundImageProps {
  background: ProfileBackground;
  /** The colour behind it, which the image fades into at the bottom. */
  fadeTo: string;
}

/**
 * The person's chosen poster or backdrop, filling its parent and fading into `fadeTo` at the
 * bottom like the hero on movie and TV pages. A light shade across the top half keeps white text
 * readable on bright images. Place it first inside a `position: relative` parent.
 */
export const ProfileBackgroundImage = memo<ProfileBackgroundImageProps>(
  ({ background, fadeTo }) => (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="profile-background">
      <MediaImage
        source={{ uri: getProfileBackgroundUrl(background) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Posters are tall: show their artwork at the top rather than the title in the middle.
        contentPosition={background.kind === 'poster' ? 'top' : 'center'}
        testID="profile-background-image"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.2)', fadeTo]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
);

ProfileBackgroundImage.displayName = 'ProfileBackgroundImage';
