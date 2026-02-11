export interface MediaTitleFields {
  title?: string | null;
  name?: string | null;
  original_title?: string | null;
  original_name?: string | null;
}

const firstNonEmpty = (values: Array<string | null | undefined>): string => {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
};

/**
 * Selects media title based on user preference.
 * Falls back to the alternate title set and then empty string.
 */
export const getDisplayMediaTitle = (
  item: MediaTitleFields,
  preferOriginal: boolean
): string => {
  if (preferOriginal) {
    return firstNonEmpty([item.original_title, item.original_name, item.title, item.name]);
  }

  return firstNonEmpty([item.title, item.name, item.original_title, item.original_name]);
};
