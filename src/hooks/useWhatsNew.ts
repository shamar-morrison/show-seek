import { CURRENT_WHATS_NEW } from '@/src/constants/whatsNew';
import { markWhatsNewSeen, shouldShowWhatsNew } from '@/src/services/whatsNewService';
import { useEffect, useState } from 'react';

/** Decides whether this launch shows the current announcement. */
export function useWhatsNew() {
  const announcement = CURRENT_WHATS_NEW;
  // Null while checking. Stays true after dismissal, so it describes the whole session.
  const [shouldShow, setShouldShow] = useState<boolean | null>(announcement ? null : false);

  useEffect(() => {
    if (!announcement) return;

    let isCancelled = false;
    void shouldShowWhatsNew(announcement.id).then((result) => {
      if (!isCancelled) setShouldShow(result);
    });

    return () => {
      isCancelled = true;
    };
  }, [announcement]);

  return {
    announcement: shouldShow ? announcement : null,
    shouldShow,
    markSeen: () => {
      if (announcement) void markWhatsNewSeen(announcement.id);
    },
  };
}
