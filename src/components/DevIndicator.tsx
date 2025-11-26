import React from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function DevIndicator() {
  if (!__DEV__) return null;

  const config = require('@/src/config/dev-config').default;
  if (!config?.ENABLE_DEV_NAVIGATION) return null;

  const isForceScreen = Object.values(config.FORCE_SCREENS).some((v) => v);
  const isOverride = Object.values(config.OVERRIDES).some((v) => v);

  let color = '#4CAF50'; // Green (Enabled)
  if (isForceScreen)
    color = '#F44336'; // Red (Force Screen)
  else if (isOverride) color = '#FFC107'; // Yellow (Override)

  const showStatus = () => {
    const activeForce = Object.entries(config.FORCE_SCREENS).find(([_, v]) => v)?.[0];
    const activeOverrides = Object.entries(config.OVERRIDES)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join('\n');

    Alert.alert(
      'Dev Navigation Active',
      `Force Screen: ${activeForce || 'None'}\n\nOverrides:\n${activeOverrides || 'None'}`,
      [{ text: 'OK' }]
    );
  };

  return (
    <TouchableOpacity onPress={showStatus} style={[styles.container, { backgroundColor: color }]}>
      <View style={styles.dot} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 9999,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dot: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
});
