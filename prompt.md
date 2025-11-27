## Performance Issue: Slow Tab Switching with Deep Navigation Stacks

### Problem Description

Tab switching becomes noticeably slow (1+ second delay) when navigation stacks become deep. This creates a poor user experience as the app feels sluggish.

**Steps to Reproduce:**

1. Start on any tab (e.g., Discover)
2. Navigate deep into the stack: Discover → Movie Details → Actor Details → Another Movie → Similar Movie → Details (5+ screens deep)
3. Try switching to a different tab (Home, Search, Library, Profile)
4. Notice significant lag/delay (1+ seconds) before the tab switches

**Expected Behavior:**

- Tab switching should be instant (<100ms) regardless of stack depth
- App should feel snappy and responsive

**Actual Behavior:**

- Tab switching gets progressively slower as stacks get deeper
- Each additional screen in the stack adds to the switching delay
- Creates a sluggish, unresponsive feel

### Root Cause

React Navigation keeps ALL screens in the stack mounted in memory by default. When switching tabs, it has to unmount/hide many screens and mount/show the new tab's screens, causing performance issues with deep stacks.

### Solution: Implement Lazy Loading and Detaching

**Option 1: Lazy Mounting (Recommended)**

Configure the stack navigators to use lazy mounting so screens are only mounted when navigated to:

```javascript
<Stack.Navigator
  screenOptions={{
    lazy: true,
    detachInactiveScreens: true,
  }}
>
  {/* screens */}
</Stack.Navigator>
```

**Option 2: Limit Stack Depth**

Implement a maximum stack depth and automatically reset the stack when exceeded:

```javascript
// When navigating to detail screen, check stack depth
// If depth > 5, reset the stack and push only the new screen
if (navigation.getState().routes.length > 5) {
  navigation.reset({
    index: 1,
    routes: [
      { name: 'TabScreen' }, // Your tab's main screen
      { name: 'DetailScreen', params: { id } },
    ],
  });
} else {
  navigation.push('DetailScreen', { id });
}
```

**Option 3: Use Modal Presentation for Detail Screens**

Instead of pushing detail screens onto the stack, present them as modals that don't accumulate:

```javascript
<Stack.Screen
  name="DetailScreen"
  options={{
    presentation: 'modal',
    gestureEnabled: true,
  }}
/>
```

**Option 4: Combine Detaching with Freezing**

Use `react-native-screens` with `detachInactiveScreens` and `freezeOnBlur`:

```javascript
<Stack.Navigator
  screenOptions={{
    detachInactiveScreens: true,
    freezeOnBlur: true,
  }}
>
```

### Implementation Requirements

1. Apply `lazy: true` and `detachInactiveScreens: true` to ALL stack navigators (Home, Search, Discover, Library)
2. Ensure `react-native-screens` is properly installed and configured
3. Test that screens still preserve their state when navigating back
4. Verify tab switching is fast even with 10+ screens in a stack
5. Consider adding a visual loading state if lazy mounting causes brief flickers

### Additional Optimization

- Add `removeClippedSubviews={true}` to long lists (FlatList, ScrollView)
- Memoize expensive components with `React.memo`
- Use `getStateFromPath` and `getPathFromState` for deep linking efficiency

### Expected Outcome

- Tab switching should be instant (<100ms) regardless of stack depth
- Memory usage should be more efficient as inactive screens are detached
- App should maintain responsiveness even with complex navigation flows
- User state should still be preserved appropriately when navigating back

Please implement these performance optimizations, prioritizing Option 1 (lazy mounting with detachInactiveScreens) as it provides the best balance of performance and user experience.
