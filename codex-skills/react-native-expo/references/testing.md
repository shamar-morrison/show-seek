# Testing (Jest + @testing-library/react-native)

## What to test

- Pure logic: utilities, hooks with mocked dependencies
- UI behavior: rendering states, navigation triggers, user interactions
- Data fetching: mock query client / API layer; test success + error paths

## Patterns

- Prefer querying by accessible text/label rather than testIDs.
- If a component depends on providers (theme, query client, i18n), create a shared test wrapper.
- For timers/animations, use fake timers carefully and reset between tests.

