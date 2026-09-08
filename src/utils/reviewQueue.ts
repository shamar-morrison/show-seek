import type { Review } from '@/src/components/detail/types';
import type { TraktReview } from '@/src/types/trakt';

/**
 * A review queued for in-place paging on the review detail screen.
 * Extends the shared Review shape with Trakt-only metadata that the
 * section list cards have but the detail screen previously dropped.
 */
export interface QueuedReview extends Review {
  /** Trakt spoiler flag. TMDB reviews never carry spoilers. */
  spoiler?: boolean;
  /** Trakt like count. TMDB reviews have no likes concept. */
  likes?: number;
}

/**
 * Convert a TraktReview to the Review format expected by the review detail screen,
 * preserving the spoiler flag and like count for the detail pager.
 */
export function traktToReview(traktReview: TraktReview): QueuedReview {
  return {
    id: traktReview.id.toString(),
    author: traktReview.user.name || traktReview.user.username,
    author_details: {
      avatar_path: traktReview.user.images?.avatar?.full || null,
      rating: traktReview.user_rating,
    },
    content: traktReview.comment,
    created_at: traktReview.created_at,
    updated_at: traktReview.created_at,
    spoiler: traktReview.spoiler,
    likes: traktReview.likes,
  };
}

/**
 * In-memory queue of sibling reviews for the review detail pager.
 *
 * Held in a module singleton (rather than URL params) because review bodies
 * are long — serializing N full reviews into `?review=` params would bloat
 * navigation state. The single review stays in params as the deep-link-safe
 * source of truth; the queue is a progressive enhancement. Consumers must
 * match the current review id against the queue — a miss (direct deep link,
 * stale queue from another title) means "no pager".
 */
let reviewQueue: QueuedReview[] | null = null;

export function setReviewQueue(reviews: QueuedReview[]): void {
  reviewQueue = reviews;
}

export function getReviewQueue(): QueuedReview[] | null {
  return reviewQueue;
}

export function clearReviewQueue(): void {
  reviewQueue = null;
}
