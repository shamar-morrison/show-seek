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
  id: '2026-11-showly-import',
  sections: [
    {
      id: 'showly-import',
      titleKey: 'whatsNew.showlyImport.title',
      descriptionKey: 'whatsNew.showlyImport.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/showly-import.png') },
    },
    {
      id: 'profile-backdrop',
      titleKey: 'whatsNew.profileBackdrop.title',
      descriptionKey: 'whatsNew.profileBackdrop.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/profile-backdrop.png') },
    },
    {
      id: 'ratings',
      titleKey: 'whatsNew.ratings.title',
      descriptionKey: 'whatsNew.ratings.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/ratings.png') },
    },
    {
      id: 'see-all',
      titleKey: 'whatsNew.seeAll.title',
      descriptionKey: 'whatsNew.seeAll.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/see-all.png') },
    },
    {
      id: 'more-like-this',
      titleKey: 'whatsNew.moreLikeThis.title',
      descriptionKey: 'whatsNew.moreLikeThis.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/more-like-this.png') },
    },
    {
      id: 'action-order',
      titleKey: 'whatsNew.actionOrder.title',
      descriptionKey: 'whatsNew.actionOrder.description',
      visual: { type: 'image', source: require('@/assets/images/whats-new/action-order.png') },
    },
  ],
};
