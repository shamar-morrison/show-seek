# Performance notes (RN + Expo)

## Quick wins

- Avoid re-render storms: memoize expensive components and callbacks.
- Prefer `FlashList` for large lists and provide stable `keyExtractor`.
- Defer heavy work off the main render path (precompute, cache, paginate).

## Animations

- Prefer Reanimated for smooth, native-driven animations.
- Keep animated values stable; avoid allocating objects every frame.

## Debugging performance

- Reproduce in release-like mode when possible; dev mode is slower.
- Identify whether the bottleneck is:
  - JS thread (renders, heavy loops)
  - UI thread (layout/overdraw)
  - network (slow requests)

