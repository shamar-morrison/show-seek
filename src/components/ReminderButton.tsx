import { COLORS } from '@/src/constants/theme';
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
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <Bell
          size={24}
          color={hasReminder ? COLORS.primary : COLORS.text}
          fill={hasReminder ? COLORS.primary : 'transparent'}
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
