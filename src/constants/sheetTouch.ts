/**
 * `pressRetentionOffset` for React Native touchables (TouchableOpacity, Pressable) that can sit
 * inside a TrueSheet.
 *
 * On Android, TrueSheet 3.x reports touch coordinates relative to the sheet while `measure()`
 * reports the button relative to the screen. React Native's Pressability compares the two on
 * every finger move, decides the finger has left the button and cancels the press, so a tap
 * whose finger jitters by even 0px never fires `onPress` (lodev09/react-native-true-sheet#861).
 * A large retention area keeps that check from cancelling real taps. Gesture handler touchables
 * compare positions relative to the button and don't need this.
 */
export const SHEET_SAFE_PRESS_RETENTION = {
  top: 4000,
  bottom: 4000,
  left: 4000,
  right: 4000,
} as const;
