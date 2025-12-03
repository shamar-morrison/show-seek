# Feature Request: Dynamic Scroll Header for Movie/TV Show Detail Screens

## Context

Currently, the movie and TV show detail screens have no header when the user is at the top of the screen. I want to implement a dynamic header that appears when the user scrolls down and disappears when they scroll back to the top.

## Current State

- Movie and TV show detail screens display content without a header at the top
- Users can see the full poster, title, and metadata without any header obstruction
- There is currently no way to see the movie/show title when scrolled down the page

## Feature Requirements

### Core Functionality

Implement a collapsing/appearing header for both movie and TV show detail screens with the following behavior:

1. **Initial State (Scroll Position = 0)**
   - No header visible
   - Full content visible including poster and title
   - Leave it just as it is right now

2. **Scrolling Down**
   - When user scrolls down past a threshold (approximately 150-200 pixels), animate a header into view
   - Header should slide down from the top with smooth animation
   - Animation duration: 250-300ms

3. **Scrolling Back Up**
   - When user scrolls back near the top (below threshold), header should animate out
   - Same animation timing but in reverse
   - Should feel smooth and responsive to scroll direction

### Header Design Specifications

**Layout:**

- Back button (left side) - standard Android back arrow icon (as used on the Cast and Crew Screen)
- Movie/TV show title (next to back button)
- Semi-transparent or solid background (ensure text readability)
- Height: Standard navigation header height (56px Android)
- Respect safe area insets for devices with notches

**Styling:**

- Background: Dark background with slight transparency or blur effect
- Text color: White or light color for contrast
- Title should truncate with ellipsis if too long (max single line)
- Include subtle bottom border or shadow for depth

**Animation:**

- Smooth slide-down/slide-up animation
- Optionally include opacity fade for more polish
- No janky or stuttering motion during scroll

### Technical Implementation Guidelines

**Recommended Approach:**

1. Use `Animated` API from React Native or `react-native-reanimated` for smooth animations
2. Track scroll position using `onScroll` event from `ScrollView` or `FlashList`
3. Calculate when to show/hide header based on `scrollY` value
4. Use `Animated.View` for the header with conditional rendering/positioning
5. Ensure header is positioned absolutely or fixed at the top
6. Consider using `React.memo` or `useMemo` for performance optimization

**State Management:**

- Track scroll position in state
- Boolean flag for header visibility
- Smooth interpolation between visible/hidden states

**Performance Considerations:**

- Debounce scroll events if necessary to prevent excessive re-renders
- Use `nativeDriver: true` for animations when possible
- Test on Android devices
- Ensure smooth performance even with complex content

### Edge Cases to Handle

1. **Rapid Scrolling:**
   - Header should respond appropriately to fast scroll gestures
   - No animation glitches or stuck states

2. **Orientation Changes:**
   - Header should adjust properly on device rotation
   - Maintain proper safe area handling

3. **Different Device Sizes:**
   - Test on various screen sizes (small phones, tablets)
   - Ensure responsive layout

4. **Initial Load:**
   - Header should be hidden on initial screen mount
   - No flash of header before hiding

5. **Navigation:**
   - Back button should work correctly (navigate to previous screen)
   - Maintain navigation stack properly

### Platform-Specific Considerations

**Android:**

- Use Android-style back arrow icon
- Respect status bar height
- Standard Android header height (56dp)

### Files to Modify/Create

Expected file structure:

- Consider creating a reusable `ScrollHeader` component if logic is shared

### Testing Checklist

After implementation, verify:

- [ ] Header is hidden when at top of screen
- [ ] Header appears smoothly when scrolling down past threshold
- [ ] Header disappears smoothly when scrolling back to top
- [ ] Back button navigates correctly
- [ ] Title displays correctly and truncates if too long
- [ ] Animation is smooth with no jank
- [ ] Works on Android
- [ ] Respects safe areas on devices with notches
- [ ] No performance issues during scroll
- [ ] Works with different content lengths (short vs long)

### Additional Enhancements (Optional)

Consider implementing these enhancements if time permits:

1. **Header Actions:**
   - Add "add to list" modal button to header
   - Add share button to header

## Success Criteria

The feature is complete when:

1. Header smoothly appears/disappears based on scroll position
2. Animation is performant with no lag or stuttering
3. Works consistently on Android
4. Respects safe areas and device-specific constraints
5. Back button functions correctly
6. Title displays appropriately (truncated if needed)
7. User experience feels polished and native to the platform

## Additional Context

Reference the existing app design patterns:

- Current detail screens have no header initially
- App uses a dark theme with good contrast
- Back navigation is crucial for user flow
- Smooth animations are important for app polish

Please implement this feature following React Native/Expo best practices, ensuring optimal performance and cross-platform compatibility.
