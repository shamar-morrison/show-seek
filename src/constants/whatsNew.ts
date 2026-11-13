import type { IconSvgElement } from '@/src/components/ui/AppIcon';

export type WhatsNewVisual =
  /** A 3:2 screenshot or artwork from `assets/images/whats-new`. */
  | { type: 'image'; source: number }
  | { type: 'icon'; icon: IconSvgElement }
  /** Another service's logo, an arrow, then the ShowSeek logo. */
  | { type: 'syncLogos'; source: number };

export interface WhatsNewSection {
  id: string;
  titleKey: string;
  descriptionKey: string;
  visual: WhatsNewVisual;
}

export interface WhatsNewAnnouncement {
  /** Must be new for each announcement. Users who have seen this ID never see it again. */
  id: string;
  sections: readonly WhatsNewSection[];
}

/**
 * The announcement existing users see once, on Home.
 *
 * To announce something new: replace this with a new `id` and sections, and swap the `whatsNew`
 * strings in every locale. Set it to null to show nothing.
 */
export const CURRENT_WHATS_NEW: WhatsNewAnnouncement | null = {
  id: '2026-11-episode-lists',
  sections: [
    {
      id: 'episode-lists',
      titleKey: 'whatsNew.episodeLists.title',
      descriptionKey: 'whatsNew.episodeLists.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/episode-lists.png') },
    },
  ],
};
