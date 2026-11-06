import ShareCardEditor from '@/src/components/shareCard/ShareCardEditor';
import { getPendingShareCards } from '@/src/components/shareCard/pendingShareCards';
import { COLORS } from '@/src/constants/theme';
import { Redirect, Stack } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function ShareCardScreen() {
  const { t } = useTranslation();
  const [cards] = useState(getPendingShareCards);

  // Nothing to share, for example after the OS restarts the app on this screen.
  if (!cards?.length) {
    return <Redirect href="/" />;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: t('shareCard.title'),
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />
      <ShareCardEditor cards={cards} />
    </>
  );
}
