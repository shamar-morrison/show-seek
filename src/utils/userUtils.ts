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
  if (displayName && displayName.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[parts.length - 1]) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return displayName.trim().substring(0, 2).toUpperCase();
  }

  if (email) {
    return email.substring(0, 2).toUpperCase();
  }

  return 'GU'; // Guest User
}
