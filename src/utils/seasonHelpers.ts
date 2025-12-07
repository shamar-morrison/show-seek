import type { Season } from '@/src/api/tmdb';

export interface UpcomingSeasonResult {
  nextSeasonAirDate: string | null;
  nextSeasonNumber: number | null;
}

/**
 * Finds the next upcoming season from a list of seasons.
 * Filters out specials (season 0), finds seasons with air dates in the future,
 * and returns the earliest one.
 *
 * @param seasons - Array of Season objects from TMDB
 * @returns Object containing the next season's air date and number, or nulls if none found
 */
export function getNextUpcomingSeason(seasons: Season[] | undefined): UpcomingSeasonResult {
  if (!seasons) {
    return { nextSeasonAirDate: null, nextSeasonNumber: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingSeason = seasons
    .filter((s) => s.season_number > 0)
    .filter((s) => s.air_date && new Date(s.air_date) > today)
    .sort((a, b) => new Date(a.air_date!).getTime() - new Date(b.air_date!).getTime())[0];

  if (upcomingSeason?.air_date) {
    return {
      nextSeasonAirDate: upcomingSeason.air_date,
      nextSeasonNumber: upcomingSeason.season_number,
    };
  }

  return { nextSeasonAirDate: null, nextSeasonNumber: null };
}
