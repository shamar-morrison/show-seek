### Bug Description

---

There is a bug/caveat with setting reminders. currently all reminders are set to trigger at 9AM EST (i think) so take the following flow:

1. User sets a reminder for new episodes/seasons. the current date is december 7, 2025
2. the reminder modal shows that the new episode/season releases today on december 7, 2025
3. the user sets an alarm for “on air day” or “one day before”

this flow leads to the reminder banner showing outdated/incorrect information as can be seen in the images.

- Banner 1: Releases Dec. 7, 2025 → Notify: Dec. 6, 2025 (one day before reminder)
- Banner 2: releases dec. 7, 2025 → notify: dec. 7, 2025 at 9AM (one release day reminder)

As you can see, banner 1 sets a reminder for a date that has already passed and banner 2 sets the reminder for the same day but what happens if 9AM has already passed?

---

### Suggested Fix:

If a user is trying to set a reminder for content that is suppose to be released on the current day, notify them in the modal and schedule the release for the next available release. e.g., the user tries to set a reminder for every episode and an episode releases today, show a notification in the modal and schedule the release for the subsequent episode. the same goes for seasons. this functionality should take into account if the information is available to set subsequent releases and handle gracefully if not.
