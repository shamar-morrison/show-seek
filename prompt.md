676-734: Verify API call volume and potential rate limiting.

This method makes up to 22 concurrent TMDB API calls (2 for upcoming content + up to 20 for individual video fetches).this request volume could trigger TMDB rate limits.

consider reducing API calls by caching upcoming lists by adding a longer cache duration for the getUpcomingMovies and getUpcomingTVShows calls within this specific context, or implementing a batch/queue mechanism for video fetches.
