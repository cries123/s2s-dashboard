import { tidyNamePart } from './tidyCase';

const PLACEHOLDER_FIRST_NAMES = /^(unknown|customer)$/i;

/** What a record with no usable name shows. "Customer" read like a person's name. */
export const NO_NAME_LABEL = 'No name on file';

/**
 * Drop placeholder first names like "Unknown" when a real last name exists, and
 * stop shouting: PBS sends "KEVIN BURNS", the app shows "Kevin Burns". Names
 * typed in mixed case are left exactly as typed.
 */
export function formatCustomerDisplayName(
  firstName?: string | null,
  lastName?: string | null
): string {
  const first = tidyNamePart((firstName || '').trim());
  const last = tidyNamePart((lastName || '').trim());
  const showFirst = first.length > 0 && !PLACEHOLDER_FIRST_NAMES.test(first);

  if (showFirst && last) return `${first} ${last}`;
  if (last) return last;
  if (showFirst) return first;
  return NO_NAME_LABEL;
}

export function customerDisplayInitials(firstName?: string | null, lastName?: string | null): string {
  const display = formatCustomerDisplayName(firstName, lastName);
  if (display === NO_NAME_LABEL) return '?';
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}
