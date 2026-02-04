import type { TimingOption } from './ReminderTimingOptions';

/**
 * Timing options for episodes (1 day before or on air day only)
 * Used for TV shows with "every_episode" frequency where "1 week before" doesn't make sense
 */
export const EPISODE_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 10 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 10 },
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 20 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 20 },
      },
    ]
  : [
      {
        value: 'on_release_day',
        labelKey: 'reminder.timingOptions.episode.onAirDay.label',
        descriptionKey: 'reminder.timingOptions.episode.onAirDay.description',
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.episode.oneDayBefore.label',
        descriptionKey: 'reminder.timingOptions.episode.oneDayBefore.description',
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
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 10 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 10 },
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 20 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 20 },
      },
      {
        value: '1_week_before',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 30 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 30 },
      },
    ]
  : [
      {
        value: 'on_release_day',
        labelKey: 'reminder.timingOptions.season.onPremiereDay.label',
        descriptionKey: 'reminder.timingOptions.season.onPremiereDay.description',
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.season.oneDayBefore.label',
        descriptionKey: 'reminder.timingOptions.season.oneDayBefore.description',
      },
      {
        value: '1_week_before',
        labelKey: 'reminder.timingOptions.season.oneWeekBefore.label',
        descriptionKey: 'reminder.timingOptions.season.oneWeekBefore.description',
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
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 10 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 10 },
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 20 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 20 },
      },
      {
        value: '1_week_before',
        labelKey: 'reminder.timingOptions.devTestInSeconds',
        labelParams: { count: 30 },
        descriptionKey: 'reminder.timingOptions.devNotificationInSeconds',
        descriptionParams: { count: 30 },
      },
    ]
  : [
      {
        value: 'on_release_day',
        labelKey: 'reminder.timingOptions.movie.onReleaseDay.label',
        descriptionKey: 'reminder.timingOptions.movie.onReleaseDay.description',
      },
      {
        value: '1_day_before',
        labelKey: 'reminder.timingOptions.movie.oneDayBefore.label',
        descriptionKey: 'reminder.timingOptions.movie.oneDayBefore.description',
      },
      {
        value: '1_week_before',
        labelKey: 'reminder.timingOptions.movie.oneWeekBefore.label',
        descriptionKey: 'reminder.timingOptions.movie.oneWeekBefore.description',
      },
    ];
