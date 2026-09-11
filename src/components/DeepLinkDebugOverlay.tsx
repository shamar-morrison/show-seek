import {
  getLastDeepLinkDebugInfo,
  subscribeDeepLinkDebug,
  type DeepLinkDebugInfo,
} from '@/src/components/DeepLinkHandler';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { NativeModules, Platform, StyleSheet, Text, View } from 'react-native';

// TEMPORARY diagnostic overlay for the widget-tap investigation. Production
// builds strip console.* (see babel.config.js), so logcat markers never
// survive — this surfaces the same info on screen instead. REMOVE BEFORE
// MERGE along with the debug store in DeepLinkHandler.
export function DeepLinkDebugOverlay() {
  const [info, setInfo] = useState<DeepLinkDebugInfo | null>(() =>
    getLastDeepLinkDebugInfo()
  );
  const [updateId, setUpdateId] = useState<string>('loading...');

  useEffect(() => {
    // updateId is only populated for OTA-delivered launches; embedded
    // builds report null. Either value identifies what's on device.
    setUpdateId(Updates.updateId ?? 'embedded(none)');
    return subscribeDeepLinkDebug(setInfo);
  }, []);

  const bridge = NativeModules.SharedPreferences ? 'yes' : 'NO';
  const widgetMod = NativeModules.WidgetUpdate ? 'yes' : 'NO';

  return (
    <View pointerEvents="none" style={styles.box}>
      <Text style={styles.title}>WIDGET DBG (temp)</Text>
      <Text style={styles.line}>update: {updateId.slice(0, 8)}</Text>
      <Text style={styles.line}>
        bridge prefs={bridge} widget={widgetMod} {Platform.OS}
      </Text>
      {info ? (
        <>
          <Text style={styles.line} numberOfLines={2}>
            url: {info.url}
          </Text>
          <Text style={styles.line} numberOfLines={2}>
            target: {info.target ?? '(none)'}
          </Text>
          <Text style={styles.line}>
            action: {info.action} via {info.source}
          </Text>
          <Text style={styles.line}>{info.at}</Text>
        </>
      ) : (
        <Text style={styles.line}>no deep link seen yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 90,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    padding: 8,
    zIndex: 9999,
  },
  title: {
    color: '#ff5555',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  line: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
