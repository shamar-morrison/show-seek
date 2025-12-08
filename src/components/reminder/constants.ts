import type { TimingOption } from './ReminderTimingOptions';

/**
 * Timing options for episodes (1 day before or on air day only)
 * Used for TV shows with "every_episode" frequency where "1 week before" doesn't make sense
 */
export const EPISODE_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Air Day',
        description: 'Get notified when the episode airs',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before the episode airs',
      },
    ];

/**
 * Timing options for season premieres (all three options)
 * Used for TV shows with "season_premiere" frequency
 */
export const SEASON_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
      {
        value: '1_week_before',
        label: 'Test in 30 seconds',
        description: 'DEV MODE: Notification in 30 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Premiere Day',
        description: 'Get notified when the season premieres',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before premiere',
      },
      {
        value: '1_week_before',
        label: '1 Week Before',
        description: 'Get notified one week before premiere',
      },
    ];

/**
 * Timing options for movies (all three options)
 * Also used for general "full timing" scenarios like EditTimingModal
 */
export const MOVIE_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
      {
        value: '1_week_before',
        label: 'Test in 30 seconds',
        description: 'DEV MODE: Notification in 30 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Release Day',
        description: 'Get notified on the day of release',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before release',
      },
      {
        value: '1_week_before',
        label: '1 Week Before',
        description: 'Get notified one week before release',
      },
    ];
