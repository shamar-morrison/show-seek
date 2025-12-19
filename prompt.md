### Feature Request

On the Home Screen I want to be able to customize the lists that are shown to include custom and default lists.

### How it should work

There should be an icon in the header top right that when clicked should open a modal that shows:

- The default Home Screen lists (trending movies, trending tv shows, top rated, etc)
- Custom lists
- Default lists (should watch, already watched, dropped, etc)

Each item should be selectable with a checkmark next to it (just like how it’s done when a user is adding an item to a list using the add to list modal). This way the user can customize their Home Screen to choose which list items they want displayed.

### Implementation Details

- The user should be able to add up to a maximum of 6 lists to be displayed
- Custom lists should still use FlashList and render data periodically, i.e. if a user has 500 items in a list, all 500 items should not be displayed in the horizontal list, use a feature similar to “onEndReached” for fetching more items from their lists. (Let me know if you think this makes sense or we should just render all the items since their list data is readily available)
- The user needs a minimum of one list displayed (they cant choose to have 0 lists shown)
- The modal should have an “apply” and “cancel” button for each corresponding action
- This data should be persisted in firebase (we already have a user collection with a lists document I think, check it out and see how it works)

If you have any questions you can ask.
