# Library Screen UI/UX Redesign Prompt

## Overview

Redesign the Library screen navigation and organization to improve user experience and accessibility. The current implementation uses tabs to display all lists, which is no longer sufficient given the expanded number of list types and rating systems.

## Current Problem

- All lists are displayed in tabs on a single screen
- Not scalable with 11+ different list types and custom user lists
- Difficult to navigate and find specific lists
- Poor UX for organizing diverse content types (lists, ratings, favorites)

## All Available Lists/Sections

### Watch Status Lists (5)

1. Currently Watching List
2. Already Watched List
3. Watching List
4. Dropped List
5. Should Watch List

### Favorites (2)

6. Favorites List (movies/shows)
7. Favorite People List

### Ratings (3)

8. Episode Ratings
9. Movie Ratings
10. TV Show Ratings

### Custom (1)

11. User-Created Custom Lists (dynamic)

---

## Desired Solution

### Primary Navigation Structure

Create a **Library Index Screen** that serves as a navigation hub with organized categories. Use cards, sections, or list items to navigate to different list types.

### Suggested Organization Strategy

#### Option A: Category-Based Organization (Recommended)

Group related items into logical categories on the index screen:

**1. My Lists Section**

- Card/Row for "Watch Status Lists" → navigates to tabbed screen with:
  - Currently Watching
  - Watching
  - Already Watched
  - Dropped
  - Should Watch
- Card/Row for "Custom Lists" → navigates to screen showing all user-created lists

**2. Ratings Section**

- Card/Row for "Episode Ratings" → navigates to episode ratings screen
- Card/Row for "Movie Ratings" → navigates to movie ratings screen
- Card/Row for "TV Show Ratings" → navigates to TV ratings screen

**3. Favorites Section**

- Card/Row for "Favorite Content" → navigates to favorites list
- Card/Row for "Favorite People" → navigates to favorite people list

#### Option B: Flat List Organization

Show all 11+ items as individual navigable cards/rows on the index screen, organized by category headers but all on one scrollable screen.

---

## UI/UX Requirements

### Library Index Screen Design

1. **Header**
   - Title: "Library"
   - Optional: Search/filter functionality
   - Optional: Settings/customize icon

2. **Content Organization**
   - Use clear visual hierarchy with section headers
   - Each navigatable item should be a card or list item with:
     - Icon representing the category
     - Title of the list
     - Optional: Count badge showing number of items
     - Optional: Preview thumbnails or last updated info
     - Chevron/arrow indicating it's tappable

3. **Visual Design**
   - Maintain consistency with existing app design system
   - Use spacing and grouping to show relationships
   - Consider using different card styles for different section types

4. **Navigation Patterns**
   - Tapping a card/item navigates to that specific list screen
   - Use Tab Provider to ensure consistency across stacks and screens
   - Maintain back navigation to return to Library index

### Individual List Screens

1. **Watch Status Lists Screen** (if grouped)
   - Use tabs to switch between the 5 watch status lists
   - Tab labels: "Currently Watching", "Watching", "Watched", "Dropped", "Should Watch"

2. **Ratings Screens**
   - Each rating type (Episodes, Movies, TV Shows) can be a separate screen
   - OR use tabs if you want to group them together
   - Show rated items with their ratings prominently
   - Sort options (by rating, by date, alphabetically)

3. **Favorites Screens**
   - Separate screens for Favorite Content and Favorite People
   - Grid or list layout depending on content type

4. **Custom Lists Screen**
   - Show all user-created lists
   - Tapping a custom list navigates to that list's content

---

## Implementation Guidelines

### File Structure

```
    LibraryScreen.tsx               # Main navigation hub
    WatchStatusListsScreen.tsx      # Grouped watch status lists with tabs
    EpisodeRatingsScreen.tsx        # Episode ratings
    MovieRatingsScreen.tsx          # Movie ratings
    TVShowRatingsScreen.tsx         # TV show ratings
    FavoritesScreen.tsx             # Favorite movies/shows
    FavoritePeopleScreen.tsx        # Favorite people
    CustomListsScreen.tsx           # User custom lists index
    CustomListDetailScreen.tsx      # Individual custom list
```

### Component Patterns

- Create reusable `LibraryCard` or `LibraryNavigationItem` component
- Use consistent navigation actions across all cards
- Extract section headers into reusable component
- Consider using `SectionList` for category organization

---

### Performance

- Optimize for smooth scrolling on index screen
- Use `FlatList` or `SectionList` for better performance with many items
- Implement lazy loading for list previews if needed
- Consider using React.memo for list items

### Empty States

- Design appropriate empty states for each list type
- Provide helpful messaging and calls-to-action
- Guide users on how to populate lists

### Loading States

- Show skeleton screens or loading indicators while fetching data
- Maintain layout stability during loading

---

## User Experience Goals

1. **Discoverability**: Users should easily find all their lists and ratings
2. **Efficiency**: Reduce taps needed to reach specific lists
3. **Scalability**: Design should accommodate future list types
4. **Clarity**: Clear visual distinction between different types of content
5. **Consistency**: Maintain patterns established in the rest of the app

---

## Implementation Steps

1. **Edit LibraryScreen**
   - Design the main navigation hub layout
   - Implement category sections with headers
   - Add navigation cards/items for each category
   - Wire up navigation to existing screens

2. **Refactor Watch Status Lists**
   - Group the 5 watch status lists into a tabbed screen
   - Ensure smooth tab transitions
   - Maintain existing list functionality

3. **Update Navigation Configuration**
   - Update app navigation to use new Library index as entry point
   - Configure screen options (headers, transitions, etc.)
   - Ensure deep linking still works if implemented

4. **Polish and Test**
   - Test navigation flow end-to-end
   - Verify all lists remain fully functional
   - Test on different screen sizes
   - Gather feedback and iterate

---

## Example Library Index Layout

```
┌─────────────────────────────────┐
│  Library                    ⚙️  │
├─────────────────────────────────┤
│                                 │
│  MY LISTS                       │
│  ┌───────────────────────────┐ │
│  │ 📺 Watch Status Lists  >  │ │
│  │ 5 lists                   │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ 📋 Custom Lists        >  │ │
│  │ 3 lists                   │ │
│  └───────────────────────────┘ │
│                                 │
│  RATINGS                        │
│  ┌───────────────────────────┐ │
│  │ ⭐ Episode Ratings     >  │ │
│  │ 156 rated                 │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ ⭐ Movie Ratings       >  │ │
│  │ 89 rated                  │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ ⭐ TV Show Ratings     >  │ │
│  │ 42 rated                  │ │
│  └───────────────────────────┘ │
│                                 │
│  FAVORITES                      │
│  ┌───────────────────────────┐ │
│  │ ❤️ Favorite Content    >  │ │
│  │ 23 items                  │ │
│  └───────────────────────────┘ │
│  ┌───────────────────────────┐ │
│  │ 👤 Favorite People     >  │ │
│  │ 15 people                 │ │
│  └───────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

---

## Additional Notes

- All existing functionality should remain unchanged
- Focus on reorganizing navigation and presentation
- Reuse existing list rendering components where possible
- Ensure consistent styling with the rest of the app

---

## Success Criteria

✅ Library index screen serves as clear navigation hub  
✅ All 11+ list types are easily accessible  
✅ Logical grouping makes content discoverable  
✅ Navigation is intuitive and requires minimal taps  
✅ Design scales to accommodate future list types  
✅ All existing list functionality remains intact  
✅ Smooth and performant on target devices
