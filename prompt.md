There is a bug in the "Add to List" modal. List items that were checked become unchecked when the model re-renders/Reappears . Here is the flow of how it happens:

- User opens the add to list modal and has several list items checked. Example: "Should watch" and "Watch it."
- User clicks "Create custom list" to open the "Create new list" modal.
- The user either creates a new list or clicks the cancel button, which then reopens the add to list modal.
- The previous list items that were checked ("Should watch" and "Watch it") are no longer checked. However, the media item is still in the lists; it's just that the list items do not appear checked in the modal.
- User has to close and reopen the modal to see that the list items are checked.
