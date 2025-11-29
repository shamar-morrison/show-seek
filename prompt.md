Add a share button to the movie/TV show detail screen with the following requirements:

1. BUTTON PLACEMENT & DESIGN:
   - Position in top right corner of the screen
   - Match the back button's design: translucent black background (rgba(0,0,0,0.5)), fully rounded (circular)
   - Same size as the back button for consistency

2. FUNCTIONALITY:
   - On press, open React Native's built-in Share API
   - Share message format: "[Movie/TV Show Title] - Check this out on [Your App Name]!"
   - Include deep link URL
   - For Android: use share dialog with installed apps
   - Add fallback to copy link to clipboard if share fails

3. IMPLEMENTATION NOTES:
   - Use expo-sharing or React Native's Share API
   - Extract media title, type (movie/tv), and ID from current screen props
   - Handle share success/failure with appropriate user feedback
   - Ensure button is positioned absolutely to avoid layout shifts
   - Test on Android for native behavior

The share button should feel native and polished, matching your app's existing design system.
