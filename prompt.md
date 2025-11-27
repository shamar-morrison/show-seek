## Bug: Initial Navigation to Detail Screen from Home Tab Fails

### Problem Description

There's a bug with the navigation refactoring where navigating to detail screens from the Home tab fails on first launch, but works after visiting detail screens from other tabs first.

**Steps to Reproduce:**

1. Launch the app (Home tab is active by default)
2. Tap on any movie or TV show card from Home tab
3. Instead of showing the detail screen, an error screen appears with:
   - Black background
   - Text: "Go to home screen!"
   - Back button in header showing "Oops!"

**Expected Behavior:**

- Should navigate directly to the movie/TV detail screen
- Should show the detail content, not an error screen

**Actual Behavior:**

- First navigation from Home tab fails and shows error screen
- After visiting a detail screen from Search/Library tab FIRST, then Home tab navigation works
- Subsequent navigations from Home tab work fine after the initial workaround

### Root Cause Analysis

This suggests a lazy loading or initialization issue with the Home tab's stack navigator:

- The detail screen routes may not be properly registered in the Home stack on initial mount
- Other tabs might be initializing their stacks differently
- There could be a race condition where the Home tab tries to navigate before its stack screens are fully set up

### What to Check/Fix

1. **Stack Screen Registration:**
   - Ensure all detail screens are registered in the Home tab's stack navigator BEFORE the initial render
   - Check if there's conditional rendering preventing screens from being registered initially

2. **Initial Route Configuration:**
   - Verify the Home stack navigator's `initialRouteName` is set correctly
   - Ensure all screens in the Home stack are defined, not lazy-loaded

3. **Navigation Parameters:**
   - Check if the navigation call from Home tab is passing parameters correctly
   - Verify the route names match exactly between navigation calls and screen definitions

4. **Stack Navigator Setup:**
   - Compare the Home tab's stack navigator setup with the other tabs (Search, Library)
   - Ensure all have the same screen definitions and configuration
   - Check if there's any async initialization that might be delaying the Home stack

5. **Common Expo Router Issues:**
   - If using file-based routing, ensure the file structure is correct
   - Check for any `href` vs `push` navigation method differences
   - Verify screen components are imported and not undefined

### Solution Requirements

- Fix should ensure Home tab's stack navigator is fully initialized on app launch
- All detail screens should be immediately navigable from Home tab without requiring workarounds
- Should not affect the working navigation from other tabs
- Maintain the persistent tab bar functionality

Please analyze the current Home tab stack navigator implementation and fix the initialization issue causing this navigation failure on first launch.
