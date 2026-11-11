import { WhatsNewSheet } from '@/src/components/WhatsNewSheet';
import { useWhatsNew } from '@/src/hooks/useWhatsNew';
import React from 'react';

/**
 * The automatic What's New sheet. Rendered beside the tab navigator (not on Home), so it shows
 * over whichever tab the app opens on, including a non-Home default launch screen or a screen
 * opened from a link. A component of its own so its state doesn't re-render the tabs.
 */
export function WhatsNewOnLaunch() {
  const { announcement, markSeen } = useWhatsNew();
  if (!announcement) return null;
  return <WhatsNewSheet announcement={announcement} onDismiss={markSeen} />;
}
