/**
 * "More like this": titles similar to a movie or show, built from TMDB's Discover search.
 *
 * TMDB's own /similar endpoint matches any title sharing a single genre (20,001 results for
 * everything, in no useful order), so instead this asks Discover for titles that share all of
 * this one's genres and any of its meaningful keywords, most-voted first. If that finds fewer than
 * 20, it relaxes to the first two genres, then the first one.
 */
import { tmdbClient, type Movie, type PaginatedResponse, type TVShow } from '@/src/api/tmdb';

type MediaType = 'movie' | 'tv';
type Keyword = { id: number; name: string };

/** Keywords that describe how a title was made rather than what it's like. */
const GENERIC_KEYWORD =
  /^(based on (novel or book|comic|manga|true story|short story|play or musical|video game|young adult novel|memoir or autobiography)|sequel|prequel|remake|aftercreditsstinger|duringcreditsstinger|woman director|3d|live action remake|anime|miniseries|biography|lgbt|female protagonist|male protagonist|christmas|holiday)$/i;

const ANIMATION_GENRE_ID = 16;
/** Fewer matches than this and the genre rule is relaxed. */
const MIN_RESULTS = 20;
/** Titles with fewer votes are mostly obscure entries that happen to share a tag. */
const MIN_VOTES = 50;

export interface MoreLikeThisPlan {
  /** Discover filters that every page is fetched with. */
  params: Record<string, string | number | boolean>;
  firstPage: PaginatedResponse<Movie | TVShow>;
}

export function meaningfulKeywords(keywords: Keyword[]): Keyword[] {
  return keywords.filter((keyword) => !GENERIC_KEYWORD.test(keyword.name.trim()));
}

/** All genres, then the first two, then the first one (each only if it's a looser rule). */
export function genreTiers(genreIds: number[]): number[][] {
  const tiers = [genreIds, genreIds.slice(0, 2), genreIds.slice(0, 1)];
  return tiers.filter(
    (tier, index) => tier.length > 0 && (index === 0 || tier.length < tiers[index - 1].length)
  );
}

const discover = (mediaType: MediaType, params: MoreLikeThisPlan['params'], page = 1) =>
  tmdbClient
    .get<PaginatedResponse<Movie | TVShow>>(`/discover/${mediaType}`, {
      params: { ...params, page },
    })
    .then(({ data }) => data);

/** Works out the filters for a title and fetches the first page with them. */
export async function resolveMoreLikeThisPlan(
  mediaType: MediaType,
  id: number
): Promise<MoreLikeThisPlan> {
  const { data } = await tmdbClient.get<{
    genres?: { id: number }[];
    keywords?: { keywords?: Keyword[]; results?: Keyword[] };
  }>(`/${mediaType}/${id}`, { params: { append_to_response: 'keywords' } });

  const genreIds = (data.genres ?? []).map((genre) => genre.id);
  const keywords = meaningfulKeywords(data.keywords?.keywords ?? data.keywords?.results ?? []);
  const base: MoreLikeThisPlan['params'] = {
    include_adult: false,
    sort_by: 'vote_count.desc',
    'vote_count.gte': MIN_VOTES,
    // Animated titles only for animated ones: otherwise anime fills in for live-action shows.
    ...(genreIds.includes(ANIMATION_GENRE_ID) ? {} : { without_genres: ANIMATION_GENRE_ID }),
    // Any of them (TMDB's "|" means or).
    ...(keywords.length ? { with_keywords: keywords.map((keyword) => keyword.id).join('|') } : {}),
  };

  const tiers = genreTiers(genreIds);
  if (tiers.length === 0) {
    return { params: base, firstPage: await discover(mediaType, base) };
  }

  let plan: MoreLikeThisPlan | null = null;
  for (const tier of tiers) {
    // All of these genres (TMDB's "," means and).
    const params = { ...base, with_genres: tier.join(',') };
    plan = { params, firstPage: await discover(mediaType, params) };
    if (plan.firstPage.total_results >= MIN_RESULTS) break;
  }
  return plan!;
}

/** A later page with the same filters as the first. */
export function fetchMoreLikeThisPage(
  mediaType: MediaType,
  plan: MoreLikeThisPlan,
  page: number
): Promise<PaginatedResponse<Movie | TVShow>> {
  return page === 1 ? Promise.resolve(plan.firstPage) : discover(mediaType, plan.params, page);
}
