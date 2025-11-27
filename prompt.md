## UI/UX Improvement: Add Section Separators for Better Visual Hierarchy

### Problem

The detail screen is becoming cluttered as more sections are added. Currently all sections (Overview, Where to Watch, Cast, Similar Movies/Shows, Photos, etc.) flow directly into each other with no clear visual separation, making it harder for users to distinguish where one section ends and another begins.

### Goal

Add visual separators between each major section on the movie and TV show detail screens to improve readability, create clear visual hierarchy, and make the content feel more organized and scannable.

### Sections That Need Separation

The following sections should have clear visual boundaries:

1. Header section (poster, title, metadata, genres, buttons)
2. Overview section
3. Director/Creator info
4. Where to Watch section
5. Cast section
6. Similar Movies/TV Shows section
7. Photos section
8. Any future sections added

### Separator Design Options

Choose the most appropriate visual separator style that matches the app's design language:

**Option 1: Horizontal Divider Lines (Subtle)**

- Thin horizontal line between sections
- Light gray or subtle color that contrasts with dark background
- Adds minimal visual weight while clearly dividing content
- Simple and clean

**Option 2: Spacing with Subtle Background Change**

- Increased vertical spacing between sections
- Optional: Alternate very subtle background shade between sections
- Creates breathing room without adding explicit dividers
- More modern, minimalist approach

**Option 3: Section Headers with Dividers**

- Small divider line or visual element above or below section headers
- Helps reinforce section titles as boundaries
- Clear and structured

**Option 4: Combination Approach (Recommended)**

- Increased vertical spacing between all sections for breathing room
- Thin horizontal divider line for major section breaks
- Consistent padding within sections
- Creates rhythm and visual flow

### Implementation Requirements

**Spacing:**

- Add consistent vertical spacing between sections (e.g., 24-32px)
- Maintain consistent padding within each section
- Ensure spacing feels balanced and not too cramped or too loose

**Divider Styling (if using lines):**

- Color: Subtle gray that works with dark theme (e.g., rgba(255,255,255,0.1) or similar)
- Thickness: Thin (1px)
- Width: Either full width or inset with horizontal margins for visual interest
- Position: Between sections, not within them

**Section Organization:**

- Each section should feel like a distinct content block
- Headers should clearly indicate what section follows
- Content should be visually grouped within its section

**Consistency:**

- Apply the same separator style throughout both movie AND TV show detail screens
- Use the same spacing and divider approach for all sections
- Maintain consistency with the rest of the app's design language

### Visual Hierarchy Goals

After implementation, users should be able to:

- Quickly scan the page and identify different sections
- Understand where one section ends and another begins
- Navigate to their desired content section easily
- Experience less cognitive load when viewing the detail screen

### Additional Considerations

**Don't Overdo It:**

- Separators should be subtle, not dominating
- Goal is clarity, not adding more visual clutter
- Less is more - use whitespace effectively

**Maintain Performance:**

- Separators should not impact scroll performance
- Keep implementation simple and lightweight

**Responsive Design:**

- Separators should work well with the scrolling behavior
- Should look good whether content is collapsed or expanded (e.g., "Read more" in overview)

**Future-Proofing:**

- Design should accommodate additional sections being added later
- Separator pattern should be reusable and consistent

### Expected Outcome

The detail screen should feel more organized, with clear visual boundaries between sections that make the content easier to scan and digest. Users should experience improved readability and a less cluttered interface while maintaining all existing functionality.

Please implement section separators for the movie and TV show detail screens using a clean, subtle approach that enhances visual hierarchy without adding clutter.
