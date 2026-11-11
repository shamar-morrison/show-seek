import { CURRENT_WHATS_NEW } from '@/src/constants/whatsNew';
import { markWhatsNewSeen, shouldShowWhatsNew } from '@/src/services/whatsNewService';
import { useCallback, useEffect, useState } from 'react';

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

/**
 * Settings > General > What's New: shows the current announcement again on demand. Unavailable
 * when there's no announcement. Closing it marks it seen, so Home doesn't show it again.
 */
export function useWhatsNewOnDemand() {
  const announcement = CURRENT_WHATS_NEW;
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const handleDismiss = useCallback(() => {
    setIsOpen(false);
    if (announcement) void markWhatsNewSeen(announcement.id);
  }, [announcement]);

  return {
    /** Null when there's nothing to show, so the row can hide. */
    open: announcement ? open : undefined,
    /** The announcement while open; mount the sheet only then, so each open presents it anew. */
    openAnnouncement: isOpen ? announcement : null,
    handleDismiss,
  };
}
