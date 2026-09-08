import {
  clearReviewQueue,
  getReviewQueue,
  setReviewQueue,
  traktToReview,
} from '@/src/utils/reviewQueue';
import type { TraktReview } from '@/src/types/trakt';

const baseTraktReview: TraktReview = {
  id: 123,
  created_at: '2024-05-01T12:00:00.000Z',
  comment: 'A great movie!',
  spoiler: false,
  user: {
    username: 'cinephile',
    name: 'Cine Phile',
    ids: { slug: 'cinephile' },
    images: { avatar: { full: 'https://example.com/avatar.jpg' } },
  },
  user_rating: 8,
  likes: 12,
};

describe('traktToReview', () => {
  it('maps all fields including spoiler flag and likes', () => {
    expect(traktToReview(baseTraktReview)).toEqual({
      id: '123',
      author: 'Cine Phile',
      author_details: {
        avatar_path: 'https://example.com/avatar.jpg',
        rating: 8,
      },
      content: 'A great movie!',
      created_at: '2024-05-01T12:00:00.000Z',
      updated_at: '2024-05-01T12:00:00.000Z',
      spoiler: false,
      likes: 12,
    });
  });

  it('falls back to username when name is empty', () => {
    const review = traktToReview({
      ...baseTraktReview,
      user: { ...baseTraktReview.user, name: '' },
    });
    expect(review.author).toBe('cinephile');
  });

  it('uses null avatar when no avatar image is present', () => {
    const review = traktToReview({
      ...baseTraktReview,
      user: { ...baseTraktReview.user, images: undefined },
    });
    expect(review.author_details.avatar_path).toBeNull();
  });

  it('preserves spoiler reviews and zero likes', () => {
    const review = traktToReview({ ...baseTraktReview, spoiler: true, likes: 0 });
    expect(review.spoiler).toBe(true);
    expect(review.likes).toBe(0);
  });

  it('passes through null ratings', () => {
    const review = traktToReview({ ...baseTraktReview, user_rating: null });
    expect(review.author_details.rating).toBeNull();
  });
});

describe('review queue store', () => {
  beforeEach(() => {
    clearReviewQueue();
  });

  it('returns null when no queue has been set', () => {
    expect(getReviewQueue()).toBeNull();
  });

  it('round-trips a queue through set/get/clear', () => {
    const queue = [traktToReview(baseTraktReview)];
    setReviewQueue(queue);
    expect(getReviewQueue()).toEqual(queue);
    clearReviewQueue();
    expect(getReviewQueue()).toBeNull();
  });
});
