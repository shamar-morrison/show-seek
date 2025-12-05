# Local Push Notifications Reminder System Implementation

## Overview

Implement a **local push notification** reminder system for a React Native/Expo movie and TV tracking app. This solution is **completely free** and uses Expo's local notification scheduling to deliver reminders directly from the user's device. Users can opt-in to receive reminders for upcoming releases of movies, TV episodes, and TV seasons.

---

## Architecture

### Components

1. **Client-side (React Native/Expo)**
   - UI for reminder opt-in/opt-out
   - Reminder preference configuration
   - Local notification scheduling and management
   - TMDB data sync with 24-hour cooldown
   - Notification rescheduling when app opens

2. **Backend (Firebase)**
   - Firestore collection for storing user reminders (sync across devices)
   - No Cloud Functions required (completely free Spark plan)

3. **External Services**
   - TMDB API for release date updates
   - Expo Local Notifications (no external service needed)

---

## Firestore Schema

### Collection: `reminders`

```
/reminders/{reminderId}
{
  userId: string,
  contentType: 'movie' | 'tv_episode' | 'tv_season',
  contentId: number, // TMDB ID
  tmdbData: {
    title: string,
    posterPath: string | null,
    releaseDate: string, // ISO 8601 format
    // For TV episodes
    seasonNumber?: number,
    episodeNumber?: number,
    episodeName?: string,
    // For TV seasons
    seasonNumber?: number,
  },
  reminderTiming: '1_day_before' | '1_week_before' | 'on_release_day',
  tvShowFrequency?: 'every_episode' | 'season_premiere_only', // Only for TV shows
  notificationScheduledFor: timestamp, // Calculated based on reminderTiming
  localNotificationId: string | null, // Expo local notification identifier
  status: 'active' | 'cancelled',
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Local Storage (AsyncStorage)

```
lastSyncTimestamp: ISO 8601 timestamp string
notificationsEnabled: boolean
```

### Indexes Required

- `reminders`: Single field index on `userId` (ASC)
- `reminders`: Composite index on `userId` (ASC) + `status` (ASC)

---

## Implementation Requirements

### Phase 1: Local Notification Setup

1. **Install Dependencies**

```bash
npx expo install expo-notifications expo-device expo-constants
```

2. **Configure app.json/app.config.js**

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#ffffff",
      "androidMode": "default",
      "androidCollapsedTitle": "New releases soon!"
    }
  }
}
```

3. **Request Notification Permissions**
   - Create a hook `useNotificationPermissions()`
   - Request permissions on first reminder setup
   - Handle permission denied gracefully (show alert)
   - Store permission status in AsyncStorage

4. **Set Up Notification Handlers**
   - Configure foreground notification behavior (show alert)
   - Handle notification taps (deep linking to content detail page)
   - Parse notification data to navigate to correct screen
   - Set up notification response listener in App.tsx

5. **Configure Notification Categories (iOS)**
   - Set up notification categories for better iOS experience
   - Add action buttons if needed (e.g., "View Details", "Dismiss")

---

### Phase 2: UI Implementation

1. **Reminder Button Component**
   - Location: Detail page action row (alongside watch trailer, add to list, rate buttons)
   - States:
     - Not set (bell icon outline)
     - Reminder active (bell icon filled with indicator)
   - On tap: Open reminder configuration modal

2. **Reminder Configuration Modal**
   - **For Movies:**
     - Toggle: Enable/Disable reminder
     - Dropdown: Reminder timing (1 day before, 1 week before, on release day)
     - Display: Release date from TMDB
     - Warning: If no release date available, show "Release date not available"
   - **For TV Shows (Episodes):**
     - Toggle: Enable/Disable reminder
     - Dropdown: Reminder timing (1 day before, 1 week before, on release day)
     - Dropdown: Frequency (Every episode, Season premieres only)
     - Display: Next episode release date if available
     - Warning: If show is cancelled, display "This show has been cancelled"
   - **For TV Shows (Seasons):**
     - Toggle: Enable/Disable reminder
     - Dropdown: Reminder timing (1 day before, 1 week before, on release day)
     - Display: Season release date if available

3. **Visual Feedback**
   - Show loading state when saving preferences
   - Show success toast when reminder is set
   - Show error toast if operation fails
   - Update button state immediately after save

---

### Phase 3: Client-Side Logic

1. **Reminder Management Service**
   - Function: `scheduleLocalNotification(reminder)` - Schedules a local notification
   - Function: `cancelLocalNotification(localNotificationId)` - Cancels a scheduled notification
   - Function: `setReminder(contentType, contentId, tmdbData, preferences)` - Creates reminder and schedules notification
   - Function: `cancelReminder(reminderId)` - Cancels reminder and its notification
   - Function: `updateReminder(reminderId, preferences)` - Updates reminder and reschedules notification
   - Function: `getUserReminders(userId)` - Fetches all user reminders
   - Function: `checkReminderExists(userId, contentId, contentType)` - Checks if reminder already exists
   - Function: `rescheduleAllReminders()` - Reschedules all active reminders (called on app open)

2. **Local Notification Scheduling**
   - Use `Notifications.scheduleNotificationAsync()` to schedule notifications
   - Store returned notification identifier in `localNotificationId` field
   - Calculate trigger time using `notificationScheduledFor` timestamp
   - Create notification content with title, body, and data payload
   - Example:

   ```javascript
   const notificationId = await Notifications.scheduleNotificationAsync({
     content: {
       title: 'New Release Today!',
       body: "Breaking Bad S5E1 'Ozymandias' releases today!",
       data: {
         contentType: 'tv_episode',
         contentId: 1396,
         seasonNumber: 5,
         episodeNumber: 1,
       },
       sound: true,
       priority: 'high',
     },
     trigger: {
       date: new Date(notificationScheduledFor),
     },
   });
   ```

3. **TMDB Data Sync with Cooldown**
   - Check `lastSyncTimestamp` in AsyncStorage
   - Only sync if more than 24 hours have passed
   - On sync:
     - Fetch all active reminders for current user
     - Fetch updated release dates from TMDB for each reminder
     - Update `tmdbData` and `notificationScheduledFor` in Firestore
     - Cancel old local notification
     - Schedule new local notification with updated time
     - Handle cancelled shows (mark reminders as cancelled, cancel notifications)
     - Handle missing release dates (mark reminders as cancelled, cancel notifications)
     - Update `lastSyncTimestamp` in AsyncStorage

4. **App Launch Rescheduling**
   - On app launch, check if sync is needed (24-hour cooldown)
   - If sync needed:
     - Cancel ALL scheduled local notifications using `Notifications.cancelAllScheduledNotificationsAsync()`
     - Fetch all active reminders from Firestore
     - For each reminder, schedule a fresh local notification
     - This ensures notifications are always up-to-date

5. **Release Date Validation**
   - Movies: Check if `release_date` exists and is not empty
   - TV Episodes: Check if `air_date` exists and is not empty
   - TV Seasons: Check if `air_date` exists and is not empty
   - TV Shows: Check if `status !== 'Cancelled'`

6. **Notification Scheduling Calculation**
   - Parse release date (EST-5 timezone)
   - Calculate notification time based on user preference:
     - `on_release_day`: Release date at 9:00 AM EST
     - `1_day_before`: Release date minus 1 day at 9:00 AM EST
     - `1_week_before`: Release date minus 7 days at 9:00 AM EST
   - Convert to local device timezone for scheduling
   - Store as UTC timestamp in Firestore

7. **Handling Past Notifications**
   - When rescheduling, check if `notificationScheduledFor` is in the past
   - If in the past, mark reminder as 'cancelled' and don't schedule
   - Clean up old cancelled reminders (older than 30 days)

---

### Phase 4: TV Show Episode Handling

Since we're using local notifications, TV show episode reminders are handled entirely on the client side when the user opens the app.

1. **Next Episode Detection**
   - For TV show reminders with `tvShowFrequency === 'every_episode'`:
   - When app opens and sync runs:
     - Check if current episode has aired (compare `notificationScheduledFor` with current date)
     - If aired, fetch next episode from TMDB
     - If next episode exists with valid air date:
       - Create new reminder for next episode
       - Schedule local notification for next episode
       - Mark current episode reminder as 'cancelled'
     - If no next episode or show is cancelled:
       - Mark current reminder as 'cancelled'

2. **Season Premiere Detection**
   - For TV show reminders with `tvShowFrequency === 'season_premiere_only'`:
   - When season premiere airs:
     - Mark current reminder as 'cancelled'
     - Fetch next season premiere date from TMDB
     - If next season exists with valid air date:
       - Create new reminder for next season premiere
       - Schedule local notification
     - If no next season:
       - Don't create new reminder

3. **Automated Chain Creation**
   - This creates a "chain" of reminders automatically
   - User sets one reminder, app handles the rest
   - User only needs to open app periodically for updates
   - Each reminder in the chain is a separate Firestore document

---

### Phase 5: Error Handling & Edge Cases

1. **Permission Denied**
   - If user denies notification permission:
     - Show alert explaining benefits of reminders
     - Provide button to open device settings
     - Disable reminder feature UI until permission granted
     - Store reminder preferences in Firestore (ready for when permission is granted)

2. **Missing or Changed Release Dates**
   - During sync, if release date becomes null:
     - Mark reminder as 'cancelled'
     - Cancel scheduled local notification
     - Show in-app banner: "Release date no longer available for [title]"
   - If release date is postponed:
     - Recalculate `notificationScheduledFor`
     - Cancel old local notification
     - Schedule new local notification
     - Keep reminder as 'active'

3. **Cancelled TV Shows**
   - During sync, if show status is 'Cancelled':
     - Mark all episode/season reminders as 'cancelled'
     - Cancel all scheduled local notifications for that show
     - Show in-app banner: "[Show name] has been cancelled"

4. **User Opts Out**
   - When user cancels a reminder:
     - Update reminder status to 'cancelled' in Firestore
     - Cancel local notification using `Notifications.cancelScheduledNotificationAsync()`
   - When user disables notifications in device settings:
     - Reminders remain in Firestore
     - Notifications won't show (OS handles this)
     - On next app open, check permission and prompt to re-enable

5. **Timezone Considerations**
   - All times stored in UTC in Firestore
   - Release dates from TMDB are in EST-5
   - Convert EST to UTC when calculating `notificationScheduledFor`
   - Local notifications automatically use device timezone
   - Use `date-fns` or `date-fns-tz` for timezone conversions

6. **App Uninstall/Reinstall**
   - Local notifications are lost on uninstall
   - Reminders persist in Firestore
   - On reinstall + login:
     - Fetch all active reminders
     - Reschedule all local notifications
     - This "restores" reminders automatically

7. **Device Reboot**
   - On Android: Scheduled notifications may be cleared on reboot
   - Solution: Reschedule all notifications when app opens

8. **Background Limitations**
   - Local notifications are scheduled when app is opened
   - If user doesn't open app for weeks, notifications may become stale
   - Acceptable trade-off for free solution
   - Consider showing badge/banner when user opens app after long period

---

## Testing Strategy

### Unit Tests

- Reminder creation with valid data
- Reminder cancellation
- Release date validation logic
- Notification scheduling calculation
- Timezone conversions
- Local notification scheduling/cancelling

### Integration Tests

- End-to-end reminder flow (create → schedule → receive notification)
- TMDB data sync with cooldown
- Notification tap handling and navigation
- App launch rescheduling logic
- TV show episode chaining

### Manual Testing Checklist

- [ ] Request and grant notification permissions
- [ ] Set reminder for movie releasing tomorrow at 9 AM EST
- [ ] Set reminder for TV episode releasing in 1 week
- [ ] Verify notification received at correct time on device
- [ ] Tap notification and verify navigation to detail page
- [ ] Cancel reminder and verify notification is cancelled
- [ ] Disable notifications in device settings and verify no notifications received
- [ ] Re-enable and verify notifications work again
- [ ] Test with cancelled TV show (should not allow reminder)
- [ ] Test with content without release date (should show warning)
- [ ] Verify sync cooldown (should not sync within 24 hours)
- [ ] Close app, wait for notification time, verify notification appears
- [ ] Kill app, reopen after 24+ hours, verify reminders rescheduled
- [ ] Test notification on both iOS and Android
- [ ] Test with device timezone different from EST
- [ ] Simulate device reboot (Android) and verify notifications reschedule on app open
- [ ] Test TV show episode chaining (set reminder, wait for episode to air, open app, verify next episode reminder created)

---

## Security Considerations

1. **Firestore Rules**

```javascript
// Users can only read/write their own reminders
match /reminders/{reminderId} {
  allow read, write: if request.auth != null
    && request.auth.uid == request.resource.data.userId;
  allow delete: if request.auth != null
    && request.auth.uid == resource.data.userId;
}
```

2. **Client-Side Security**
   - Validate all user input before creating reminders
   - Sanitize TMDB data before storing in Firestore
   - Never expose TMDB API key in client code (use environment variables)
   - Store API keys in `.env` file and load with `expo-constants`

3. **Data Privacy**
   - Reminder data is private to each user
   - Notification content is stored locally on device
   - No sharing of notification data with third parties

---

## Deployment Steps

1. **Client-side:**
   - Update app.json with notification configuration
   - Add notification icon and sound assets
   - Build development build with `eas build --profile development` (local notifications require dev build, not Expo Go)
   - Test on physical devices (notifications don't work reliably on simulators)
   - Submit to app stores with notification permission descriptions in app.json:
     ```json
     "ios": {
       "infoPlist": {
         "NSUserNotificationsUsageDescription": "We'll notify you when your favorite shows and movies are releasing."
       }
     },
     "android": {
       "permissions": ["NOTIFICATIONS"]
     }
     ```

2. **Backend:**
   - Deploy Firestore security rules
   - Create Firestore indexes (use Firebase console or firebase CLI)

3. **Monitoring:**
   - Monitor Firestore read/write usage in Firebase console
   - Track notification delivery rates via app analytics
   - Log sync operations for debugging
   - Set up Firebase Performance Monitoring for app launch times

---

## Notes for Implementation

- Use Firebase MCP server for all Firestore operations
- Follow existing code patterns and conventions in the app
- Ensure all async operations have proper error handling
- Add TypeScript types for all reminder-related interfaces
- Document any TMDB API quirks or limitations discovered
- Test thoroughly on both iOS and Android before deployment
- **Key Point**: All release dates from TMDB are in EST-5 timezone
- **Key Point**: This is a FREE solution using local notifications (no Cloud Functions required)
- **Key Point**: Reminders update when user opens the app (not in real-time background)
- **Key Point**: Test on real devices, not simulators (local notifications don't work reliably on simulators)
- **Key Point**: Requires Expo dev build, not Expo Go (local notifications with custom configuration need dev builds)
- Remember to reschedule all notifications on app launch if sync is needed
- Use `date-fns` or `date-fns-tz` for all date/time operations
- Consider showing a "Sync in progress..." indicator when updating reminders on app launch
