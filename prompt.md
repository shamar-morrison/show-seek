### Feature Request

---

I want to add a feature where if the user rates a movie/tv show it is auto added to their “already watched” list.

### Implementation details

---

There are currently a number of default lists and “already watched” is one of them, once the user rates a movie or show I want to auto add this to the list. This implementation should be persisted in firebase as a user preference so the user can toggle it on or off, but by default its on so if the user doesn’t have a preferences field in firebase its on. There is already a similar feature where if a user marks an episode as watched then the tv show gets added to the “watching” list, so you can look at that implementation and follow suite. the toggle should be in the user profile in the settings section. Do you have any questions?

1. yes
2. just movies for now, we can always extend it to include tv shows later
3. skip adding it
4. when they rate it for the first time
