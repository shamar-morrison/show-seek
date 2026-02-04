import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Bell } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';

interface ReminderButtonProps {
  onPress: () => void;
  hasReminder?: boolean;
  isLoading?: boolean;
}

export default function ReminderButton({
  onPress,
  hasReminder = false,
  isLoading = false,
}: ReminderButtonProps) {
  const { accentColor } = useAccentColor();
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={accentColor} />
      ) : (
        <Bell
          size={24}
          color={hasReminder ? accentColor : COLORS.text}
          fill={hasReminder ? accentColor : 'transparent'}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
