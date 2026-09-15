/**
 * Curated data for the `hideTalkShowsAndAwards` preference.
 *
 * TMDB has no single genre that covers talk shows, late-night, daytime talk,
 * news talk and award ceremonies, so filtering combines three narrow layers
 * (see `src/utils/nonScriptedFilter.ts`):
 *
 * 1. Genre IDs — only Talk (10767) and News (10763). Reality (10764) and
 *    War & Politics (10768) are deliberately NOT blanket-banned so scripted
 *    shows like Survivor, The West Wing or House of Cards keep showing.
 * 2. TMDB TV ID blocklist — numeric IDs below are restricted to entries this
 *    repo already references (1408 = SNL, 2224 = The Daily Show, both used as
 *    genre visuals / fixtures). Everything else is covered by the title list
 *    and name patterns instead of guessed numeric IDs: a wrong numeric ID
 *    could collide with a scripted show and hide it for everyone, while an
 *    exact-title match can never collide with a differently-titled scripted
 *    show. Extend the ID set only with verified TMDB IDs.
 * 3. Exact-title list + award-ceremony name patterns — covers the popular and
 *    niche long tail (late-night, daytime, UK chat, morning shows, aftershows,
 *    ceremonies) including entries that TMDB genres as Comedy/Reality.
 *
 * Performance: all structures are built once at module load (`Set` for O(1)
 * lookups, pre-compiled `RegExp`s). The filter itself is a synchronous,
 * allocation-free predicate that runs inside the existing `useContentFilter`
 * memo — no network, no storage, no extra renders.
 */

/** TMDB TV genre IDs that always indicate talk/news-talk content. */
export const TALK_SHOW_GENRE_IDS: readonly number[] = [10767, 10763];

/**
 * Verified TMDB TV IDs for non-scripted talk/awards shows.
 * Only IDs referenced elsewhere in this repo — extend with verified IDs only.
 */
const TALK_AWARDS_BLOCKLIST_ID_LIST: readonly number[] = [
  1408, // Saturday Night Live
  2224, // The Daily Show
];

export const TALK_AWARDS_BLOCKLIST_IDS: ReadonlySet<number> = new Set(
  TALK_AWARDS_BLOCKLIST_ID_LIST
);

/**
 * Normalize a show title for exact matching: lowercase, strip punctuation,
 * collapse whitespace. Applied to both the list entries and incoming titles
 * so variants like "Jimmy Kimmel Live!" still match.
 */
export const normalizeTalkShowTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const TALK_AWARDS_TITLE_LIST: readonly string[] = [
  // US late-night
  'the tonight show starring jimmy fallon',
  'tonight show starring jimmy fallon',
  'the tonight show with jay leno',
  'the tonight show',
  'late show with stephen colbert',
  'the late show with stephen colbert',
  'late show with david letterman',
  'the late show with david letterman',
  'jimmy kimmel live',
  'late night with seth meyers',
  'late night with conan obrien',
  'late night with jimmy fallon',
  'the late late show with james corden',
  'the late late show with craig ferguson',
  'the late late show',
  'conan',
  'the daily show',
  'the colbert report',
  'last week tonight with john oliver',
  'real time with bill maher',
  'full frontal with samantha bee',
  'the problem with jon stewart',
  'patriot act with hasan minhaj',
  'desus and mero',
  'desus mero',
  'watch what happens live with andy cohen',
  'watch what happens live',
  'chelsea lately',
  'the chelsea handler show',
  'bus down',
  // Daytime / syndicated talk
  'the ellen degeneres show',
  'the oprah winfrey show',
  'the view',
  'live with kelly and mark',
  'live with kelly and ryan',
  'live with regis and kelly',
  'the kelly clarkson show',
  'the drew barrymore show',
  'the jennifer hudson show',
  'dr phil',
  'the dr oz show',
  'the wendy williams show',
  'the talk',
  'the real',
  'good morning america',
  'today',
  'cbs mornings',
  'cbs this morning',
  'this morning',
  // News talk / Sunday shows
  'meet the press',
  'face the nation',
  'state of the union',
  'this week',
  'fox news sunday',
  // UK / international chat
  'the graham norton show',
  'friday night with jonathan ross',
  'the jonathan ross show',
  'the russell howard hour',
  'have i got news for you',
  'mock the week',
  'the project',
  'le grand journal',
  // Satire / comedy news talk
  'the night daily show',
  'the daily show with trevor noah',
  'the opposition with jordan klepper',
  // Aftershows / companion talk
  'talking dead',
  'talking bad',
  'talking saul',
  'anarchy afterword',
  // Interview / niche talk
  'hot ones',
  'wtf with marc maron',
  'my next guest needs no introduction with david letterman',
  'my next guest needs no introduction',
  'comedians in cars getting coffee',
  'the howard stern show',
  'the joe rogan experience',
  // Award ceremonies (exact titles; year-suffixed variants are caught by patterns)
  'the academy awards',
  'academy awards',
  'the oscars',
  'oscars red carpet',
  'golden globe awards',
  'the golden globes',
  'grammy awards',
  'the grammys',
  'primetime emmy awards',
  'emmy awards',
  'the emmys',
  'british academy film awards',
  'bafta film awards',
  'screen actors guild awards',
  'tony awards',
  'the tony awards',
  'mtv video music awards',
  'mtv movie tv awards',
  'peoples choice awards',
  'critics choice awards',
  'kids choice awards',
  'country music association awards',
  'billboard music awards',
  'american music awards',
  'eurovision song contest',
  'miss universe',
  'miss america',
  'live from the red carpet',
];

export const TALK_AWARDS_TITLE_SET: ReadonlySet<string> = new Set(
  TALK_AWARDS_TITLE_LIST.map(normalizeTalkShowTitle)
);

/**
 * Ceremony-name safety net for year-suffixed variants
 * ("The 96th Academy Awards", "Oscars 2024") that exact titles miss.
 * Tested against `name`/`title` only — never overviews — so phrases like
 * "award-winning drama" in a description can never match.
 */
export const AWARD_NAME_PATTERNS: readonly RegExp[] = [
  /\boscar/i,
  /\bacademy\s*award/i,
  /\bemmy/i,
  /\bgrammy/i,
  /\bgolden\s*globe/i,
  /\bbafta/i,
  /\bsag\s*award/i,
  /\bscreen\s*actors?\s*guild/i,
  /\btony\s*award/i,
  /\btonys?\b/i,
  /\bmtv\s*(video\s*music|movie\s*(?:&|and)\s*tv)\s*award/i,
  /\bpeople'?s\s*choice\s*award/i,
  /\bcritics'?\s*choice\s*award/i,
  /\bkids'?\s*choice\s*award/i,
  /\bbillboard\s*music\s*award/i,
  /\bamerican\s*music\s*award/i,
  /\bcountry\s*music\s*(?:association\s*)?award/i,
  /\beurovision/i,
  /\bmiss\s*(universe|america|world)\b/i,
  /\bred\s*carpet/i,
];
