/**
 * User-related utility functions
 */

/**
 * Extract initials from display name or email
 * @param displayName - User's display name
 * @param email - User's email address
 * @returns Two-character initials in uppercase
 */
export function getInitials(displayName: string | null, email: string | null): string {
  let initials = '';

  if (displayName && displayName.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
      initials = parts[0][0] + parts[parts.length - 1][0];
    } else {
      initials = displayName.trim().substring(0, 2);
    }
  } else if (email) {
    initials = email.substring(0, 2);
  } else {
    return 'GU'; // Guest User
  }

  const result = initials.toUpperCase();
  return result.length === 1 ? result.padEnd(2, result[0]) : result;
}
