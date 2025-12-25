import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

const HEADER_TOUCH_SIZE = 40;

export function HeaderIconButton({
  onPress,
  children,
  style,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ borderless: true, radius: HEADER_TOUCH_SIZE / 2 }}
      style={({ pressed }) => ({
        ...StyleSheet.flatten(style),
        width: HEADER_TOUCH_SIZE,
        height: HEADER_TOUCH_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
