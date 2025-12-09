### Bug Description

---

I previously had an issue where selecting a list from the add to list modal would make that list jump to the bottom of the modal, it was fixed but I recently changed from a modal to using TrueSheet from a library and now the problem is back. Consider the following:

1. We have the following list of lists: [ “Should Watch”, “Watching”, “Already Watched”, “Favorites”, “Dropped”, “Mike”, “Luna”, “Jessie”, “James” ]
2. We select “Luna” from the list, so it jumps to the bottom and the list order is now: [ “Should Watch”, “Watching”, “Already Watched”, “Favorites”, “Dropped”, “Mike”, “Jessie”, “James”, “Luna” ]

The list we selected “Luna” is now at the end of the list, which doesn’t make sense, it should maintain its original position, if every time a user selects a list and it jumps to the bottom that is bad UX. Note: this does NOT happen with default lists, they maintain their position.
