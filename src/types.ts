export interface WidgetConfig {
  id: string;
  type: 'upcoming-movies' | 'upcoming-tv' | 'watchlist';
  listId?: string;
  userId?: string;
  size: 'small' | 'medium' | 'large';
  createdAt: number;
}
