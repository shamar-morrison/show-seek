import { ShareCardData } from './shareCardTypes';

/**
 * Hands cards to the share card screen. They stay out of the route's params because a title
 * like "100% Wolf" would have to survive being encoded into a URL.
 */
let pendingCards: ShareCardData[] | null = null;

export function setPendingShareCards(cards: ShareCardData[]) {
  pendingCards = cards;
}

export function getPendingShareCards() {
  return pendingCards;
}
