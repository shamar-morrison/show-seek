import { COLORS } from '@/src/constants/theme';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="email-sign-in" />
    </Stack>
  );
}
