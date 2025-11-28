export const getRatingText = (rating: number): string => {
  if (rating >= 1 && rating <= 2) return 'Terrible';
  if (rating >= 3 && rating <= 4) return 'Not Good';
  if (rating === 5) return 'Average';
  if (rating >= 6 && rating <= 7) return 'Pretty Good';
  if (rating >= 8 && rating <= 9) return 'Great';
  if (rating === 10) return 'Masterpiece';
  return '';
};
