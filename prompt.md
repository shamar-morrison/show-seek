### Feature Request

On the person detail screen in the “Known For” and “Directed/Written” by sections I want to add a button that says “view all” this button will navigate to another screen where I can see all of the credits attributed to the person.

### How It should work

# For Actors (those with the “acting” job/role):

- A “view all” button beside each category (Known For Movies and Known For TV Shows) which will navigate to another screen where I can see all of the credits attributed to the person for the respective media type.

# For Directors (those with the “directing” job/role):

- A “view all” button beside each category (Directed/Written Movies and Directed/Written tv shows) which will navigate to another screen where I can see all of the credits attributed to the person for the respective media type.

# For Everyone else

- The same functionality as above in regards to how the directors work because other jobs are producers, sound engineers, etc but in the end they all have their own credits either way.

### Notes

- The “view all” button should be aligned and styled like the one used in the “cast section” component
- The new screens should have a respective title (you decide what it should say) and use the “view toggle” icon functionality
- The screens should maintain their tab route in the current tab/stack

Do you have any questions?

1.
2. you'll have to scan the codebase and find out
3. whatever the current convention is
4. no, that can be added later
5. if an actor has no credits then the "view all" button should not appear in the first place for that category
