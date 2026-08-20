const PLACEHOLDER_FIRST_NAMES = /^(unknown|customer)$/i;

/** Drop placeholder first names like "Unknown" when a real last name exists. */
export function formatCustomerDisplayName(
  firstName?: string | null,
  lastName?: string | null
): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const showFirst = first.length > 0 && !PLACEHOLDER_FIRST_NAMES.test(first);

  if (showFirst && last) return `${first} ${last}`;
  if (last) return last;
  if (showFirst) return first;
  return 'Customer';
}

export function customerDisplayInitials(firstName?: string | null, lastName?: string | null): string {
  const display = formatCustomerDisplayName(firstName, lastName);
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || 'CU').toUpperCase();
}
