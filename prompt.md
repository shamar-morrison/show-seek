# Feature: Custom Date Picker Component

## Overview

Build a custom, reusable date picker component for React Native/Expo that can be used throughout the app. This replaces the problematic `@react-native-community/datetimepicker` package. The date picker should allow users to select dates from January 1, 2000 to the current date, with an intuitive calendar interface.

## Component Requirements

### Basic Specifications

- **Component Type**: Reusable React Native component
- **Date Range**: January 1, 2000 (minimum) to current date (maximum)
- **Default Date**: Today's date
- **Validation**: Block selection of future dates
- **TypeScript**: Fully typed with proper interfaces

### Component API

```typescript
interface DatePickerProps {
  selectedDate?: Date;
  onDateSelect: (date: Date) => void;
  minDate?: Date; // Optional, defaults to January 1, 2000
  maxDate?: Date; // Optional, defaults to today
  onCancel?: () => void; // Optional cancel callback
}
```

## UI/UX Design

### Layout Structure

```
┌─────────────────────────────────────┐
│  ← [Month Year Header] →            │ (Tappable to open picker)
├─────────────────────────────────────┤
│  Su  Mo  Tu  We  Th  Fr  Sa         │ (Day headers)
├─────────────────────────────────────┤
│                  1   2   3   4      │
│   5   6   7   8   9  10  11         │
│  12  13  14  15  16  17  18         │
│  19  20  21  22  23  24  25         │
│  26  27  28  29  30  31             │
├─────────────────────────────────────┤
│           [Cancel] [Confirm]        │ (Action buttons)
└─────────────────────────────────────┘
```

### Header Section

**Month/Year Display**:

- Format: "January 2024"
- Centered with left/right arrow buttons
- Tappable to open month/year picker modal

**Navigation Arrows**:

- Left arrow: Go to previous month
- Right arrow: Go to next month
- Disable left arrow when at minimum date (January 2000)
- Disable right arrow when at maximum date (current month)
- Use existing icon components from your app

### Calendar Grid

**Day Headers**:

- Display: Su, Mo, Tu, We, Th, Fr, Sa
- Style: Subtle text, smaller font size
- Use app's secondary/muted text color

**Date Cells**:

- Layout: 7 columns × variable rows (4-6 rows depending on month)
- Each cell should be tappable

**Cell States**:

1. **Default (selectable dates)**:
   - Background: Transparent
   - Text: Primary text color
   - Border: None
   - Pressable with visual feedback

2. **Selected date**:
   - Background: Primary/accent color (circular)
   - Text: White or contrasting color
   - Make it visually prominent

3. **Today** (if not selected):
   - Border: Thin border in primary color (circular)
   - Text: Primary text color
   - Background: Transparent

4. **Disabled (future dates or out of range)**:
   - Background: Transparent
   - Text: Muted/gray color
   - Not pressable

5. **Other month dates** (padding dates from prev/next month):
   - Text: Very light gray/muted
   - Optional: Hide completely or show for context

### Month/Year Picker Modal

**Trigger**: When user taps on the month/year header

**Layout**:

- Should appear as a modal or dropdown overlay
- Two columns: Months | Years

**Months Column**:

- Scrollable list of all 12 months
- Highlight current selected month
- Format: Full month names (January, February, etc.)

**Years Column**:

- Scrollable list from 2000 to current year
- Highlight current selected year
- Consider using a picker-style scrollable component

**Behavior**:

- When user selects a month/year combination, close the modal and update the calendar
- Validate that the selected month/year combination doesn't allow future dates
- If selected month/year is current month/year, ensure future dates are disabled

### Action Buttons

**Cancel Button**:

- Position: Bottom left
- Style: Outline or text button
- Action: Call `onCancel` callback if provided, otherwise just close picker

**Confirm Button**:

- Position: Bottom right
- Style: Primary/filled button
- Action: Call `onDateSelect` with selected date
- Disabled if no date is selected (optional, or auto-select today's date)

## Styling Requirements

- Use the app's existing color scheme for all colors (primary, secondary, background, text colors, etc.)
- Match existing button styles from your UI component library
- Use consistent spacing, border radius, and typography with the rest of the app
- Ensure the component is accessible with proper touch targets (minimum 44x44 points)
- Support both light and dark mode if your app has theme switching

## Functionality Requirements

1. **Date Selection**:
   - Tapping a date should select it and update the visual state
   - Only one date can be selected at a time
   - Selecting a new date should deselect the previous one

2. **Month Navigation**:
   - Arrow buttons should smoothly transition between months
   - Handle year boundaries (December → January transitions)
   - Respect min/max date constraints

3. **Quick Month/Year Selection**:
   - Tapping header opens month/year picker
   - Selecting a new month/year should update the calendar immediately
   - Validate selections against min/max constraints

4. **Validation**:
   - Prevent selection of dates before January 1, 2000
   - Prevent selection of dates after today
   - Disable future dates visually and functionally
   - Handle edge cases (e.g., user tries to navigate to future months)

5. **Calendar Generation**:
   - Correctly handle months with different day counts (28, 29, 30, 31)
   - Handle leap years correctly
   - Display dates from previous/next months as padding if needed for full weeks

## Technical Implementation Notes

- Use React hooks (useState, useMemo, useCallback) for state management
- Optimize re-renders (useMemo for calendar grid generation)
- Use date manipulation carefully (avoid timezone issues)
  - Consider using a lightweight date library like `date-fns` if needed, or use native JavaScript Date
- Make the component performant (avoid unnecessary re-renders)
- Add proper TypeScript types for all props and internal state
- Component should be self-contained and not depend on external state management

## Integration Points

This component should be:

1. **Reusable**: Can be used anywhere in the app that needs date selection
2. **Flexible**: Props allow customization of min/max dates
3. **Controlled**: Parent component manages what happens when date is selected

### Example Usage

```typescript
import { CustomDatePicker } from '@/components/CustomDatePicker';

// In your component:
const [selectedDate, setSelectedDate] = useState<Date>(new Date());
const [showPicker, setShowPicker] = useState(false);

<CustomDatePicker
  selectedDate={selectedDate}
  onDateSelect={(date) => {
    setSelectedDate(date);
    setShowPicker(false);
  }}
  onCancel={() => setShowPicker(false)}
/>
```

## Testing Considerations

Ensure the component handles:

- Month boundaries (transitioning from January to December and vice versa)
- Leap years (February 29)
- Year 2000 (minimum date edge case)
- Current date (maximum date edge case)
- Different screen sizes (responsive layout)
- Touch interactions (proper touch targets)

## File Structure

Create the component in an appropriate location:

- Main component: `components/CustomDatePicker/CustomDatePicker.tsx`
- Types: `components/CustomDatePicker/types.ts`
- Styles: Use StyleSheet or your existing styling solution
- Optional: Helper functions in `components/CustomDatePicker/utils.ts`

Let me know if you need any clarification on the implementation!
