# Performance Analysis: Detail Screen Latency

## Executive Summary

The perceived lag of over 1 second on subsequent visits to `MovieDetailScreen` and `TVDetailScreen` is primarily caused by **synchronous rendering of a massive component tree when data is cached**.

On the first visit, the screen renders in a lightweight "Loading" state (ActivityIndicator) while data is fetched. This splits the work into two frames: Mount -> Fetch -> Render.
On subsequent visits, `react-query` provides the cached data immediately. Consequently, React attempts to mount and render the entire scroll view—including Hero images, 5+ horizontal lists, gradients, and dozens of sub-components—in a single synchronous JavaScript task. This blocks the UI thread during the navigation transition, causing the "freeze."

## Ranked Causes & Recommended Fixes

### 4. Component Tree Complexity (Low Impact)

- **Finding:** The detail screens contain deep component trees with heavily nested views (`MediaImage`, `LinearGradient`, badges, icons).
- **Impact:** While optimizing individual components helps, the sheer _number_ of components being mounted at once is the root issue.
- **Recommended Fix:**
  - **Memoization:** Ensure child components like `MediaImage`, `Gradient`, and small UI badges are wrapped in `React.memo` to prevent unnecessary re-renders when parent state changes (e.g., scroll events).
  - **Fragmenting:** Break the massive `MovieDetailScreen` into smaller sub-components (e.g., `<HeroSection />`, `<InfoSection />`) to isolate renders.

### 3. Unoptimized List Rendering (Medium Impact)

- **Finding:** Sections like `CastSection`, `SimilarMediaSection`, `PhotosSection`, and `VideosSection` use `ScrollView` with `.map()` instead of `FlatList` or `FlashList`.
- **Impact:** With 5-6 such sections on the screen, the app is rendering ~50-60 complex card components (each with images and text) simultaneously on mount. `FlatList` would only render the first few visible items on screen.
- **Recommended Fix:**
  - **Adopt FlashList:** Replace the `ScrollView` + `.map()` pattern in all horizontal sections with `FlashList` from `@shopify/flash-list`.
  - **EstimatedLines:** Provide the `estimatedItemSize` prop to `FlashList` to ensure accurate initial layout measurements without recalculation.

### 2. Excessive Firestore Subscriptions (High Impact)

- **Finding:** `useLists`, `useRatings`, and `useWatchedMovies` set up individual Firestore listeners inside `useEffect` on every screen mount.
- **Impact:** When navigating deeper into the stack (Movie A -> Movie B), these listeners accumulate. A stack of 3 movies results in ~9 active real-time listeners, consuming CPU during the mount phase.
- **Recommended Fix:**
  - **Global Context:** Move `useLists` and `useRatings` subscriptions to a global Context provider (already partially done for some, but ensure it's not re-subscribing).
  - **Lazy Subscriptions:** For `useWatchedMovies` (which is specific to the movie), delay the subscription until the user actually interacts with or views that data, or ensure the listener setup is wrapped in a `setTimeout` so it doesn't run during the initial mount frame.

### 1. Synchronous Rendering on Cache Hit (Primary Cause)

- **Finding:** The "Subsequent Visit" performance penalty is the result of bypassing the `isLoading` state. On cache hit, `isLoading` is false, and the component immediately returns the full `Animated.ScrollView` JSX, blocking the JS thread.
- **Recommended Fix:**
  - **Progressive Rendering (The "Hack"):** Force a "loading" state even if data is available, to yield control back to the UI thread for one frame.
  - **Implementation:** Use a `useState(false)` that flips to `true` inside a `useEffect` with `requestAnimationFrame`.

  ```typescript
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Wait for the next frame to let navigation transition start smoothly
    requestAnimationFrame(() => {
      setIsReady(true);
    });
  }, []);

  if (!isReady || movieQuery.isLoading) {
    return <LoadingIndicator />;
  }
  ```

  - **Skeleton UI:** Instead of a spinner, show a skeleton of the Hero section during this split-second wait to make it feel instant.
