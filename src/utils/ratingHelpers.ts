export const getRatingText = (rating: number): string => {
  if (rating >= 1 && rating <= 2) return 'Terrible'; // 1, 1.5, 2
  if (rating >= 2.5 && rating <= 4) return 'Not Good'; // 2.5, 3, 3.5, 4
  if (rating >= 4.5 && rating <= 5.5) return 'Average'; // 4.5, 5, 5.5
  if (rating >= 6 && rating <= 7) return 'Pretty Good'; // 6, 6.5, 7
  if (rating >= 7.5 && rating <= 9) return 'Great'; // 7.5, 8, 8.5, 9
  if (rating >= 9.5 && rating <= 10) return 'Masterpiece'; // 9.5, 10
  return '';
};
