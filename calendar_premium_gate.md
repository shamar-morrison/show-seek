# Feature: Premium Gating for Release Calendar

## Context

The "Release Calendar" feature is a premium-only feature. We want to show non-premium users a preview of what they are missing to encourage upgrades. Instead of simply blocking access, we will display a visually appealing "Paywall / Teaser" screen when they try to access it.

## Objective

Update the `HomeDrawer` navigation logic for the "Release Calendar" item. If the user is not premium, navigate to a new "Premium Teaser" screen instead of the actual Calendar.

## Impacted Files

- `src/components/HomeDrawer.tsx`
- `src/components/calendar/CalendarPremiumGate.tsx` (New Component)
- `assets/images/calendar_bg.png` (Asset to be used)

## Requirements

### 1. Navigation Logic (`HomeDrawer.tsx`)

- Check `isPremium` status from `usePremium()`.
- **Logic:**
  - If `isPremium === true`: Navigate to `/(tabs)/home/calendar` (Current behavior).
  - If `isPremium === false`:
    - **Option A:** Navigate to a new route `/(tabs)/home/calendar-premium` (Cleaner for routing).
    - **User Request:** "when a user clicks... they should see a screen".
    - **Best Implementation:** Navigate to `/(tabs)/home/calendar` regardless. inside `calendar.tsx`, check `isPremium`. If false, render the `CalendarPremiumGate` component INSTEAD of `ReleaseCalendar`. This keeps the URL/route consistent (`/calendar`) but changes the _view_.

### 2. Premium Teaser UI (`CalendarPremiumGate.tsx`)

Create a new component `src/components/calendar/CalendarPremiumGate.tsx`.

**Visual Design:**

- **Background:** `@/assets/images/calendar_bg.png` (User provided asset).
  - Use `ImageBackground` or `Expo Image` absolute filled.
  - **Important:** Add a heavy **Linear Gradient** overlay (Transparent -> Black) to ensure text readability and create a "premium" dark aesthetic.
- **Content (Centered/Bottom-aligned):**
  - **Icon:** Large `Calendar` icon (Gold/Premium color).
  - **Title:** "Track Your Release Schedule" (or similar).
  - **Description:** "Never miss a season premiere again. Get a personalized timeline of all your upcoming movies and TV shows."
  - **CTA Button:** "Upgrade to Premium" (Primary Color).
    - Action: Navigate to `/premium` or open the Premium Modal.

### 3. Implementation Details

#### A. Update `app/(tabs)/home/calendar.tsx`

- Import `usePremium`.
- Import `CalendarPremiumGate`.
- Logic:

  ```tsx
  const { isPremium } = usePremium();

  if (!isPremium) {
    return <CalendarPremiumGate />;
  }

  return <ReleaseCalendar ... />;
  ```

#### B. Create `src/components/calendar/CalendarPremiumGate.tsx`

- Props: None (or `onUpgrade` callback).
- Navigation: Use `router.push('/premium')` (or wherever the upgrade screen is).

#### C. Asset

- Ensure `@/assets/images/calendar_bg.png` exists or is handled gracefully if missing (fallback gradient).

## Summary

1.  **Modify `calendar.tsx`**: Add the premium check.
2.  **Create `CalendarPremiumGate`**: Build the visual paywall component.
3.  **Drawer**: No changes needed (it just navigates to `/calendar`).

## Edge Cases

- **Slow Loading:** While `isPremium` is loading, show a loading spinner or default to the locked view (safe default).
