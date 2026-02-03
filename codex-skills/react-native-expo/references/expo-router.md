# expo-router patterns

## Common tasks

- Add a new screen by creating a file under `app/`.
- Use route groups to organize flows without changing URL segments.
- Use layout files to apply shared UI/navigation to a subtree.

## Debugging navigation issues

- Confirm you are editing the correct route file (route groups can be confusing).
- Verify dynamic routes (e.g. `[id].tsx`) handle missing/invalid params.
- If deep linking breaks, check app linking configuration and route paths.

