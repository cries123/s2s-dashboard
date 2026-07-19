const PLACEHOLDER_FIRST_NAMES = /^(unknown|customer)$/i;

function normalizeOpenRoNameToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDisplayName(firstName?: string, lastName?: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const showFirst = first.length > 0 && !PLACEHOLDER_FIRST_NAMES.test(first);
  if (showFirst && last) return `${first} ${last}`;
  if (last) return last;
  if (showFirst) return first;
  return '';
}

function appendNameKey(map: Map<string, string[]>, key: string, customerId: string): void {
  if (!key) return;
  const existing = map.get(key) || [];
  if (!existing.includes(customerId)) existing.push(customerId);
  map.set(key, existing);
}

/** Build lookup keys for a PBS/CRM display name (handles multi-part names). */
export function buildOpenRoNameKeys(displayName: string): string[] {
  const normalized = normalizeOpenRoNameToken(displayName);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  const parts = normalized.split(' ').filter(Boolean);

  if (parts.length >= 2) {
    keys.add(`${parts[0]} ${parts[parts.length - 1]}`);
    keys.add(`${parts[parts.length - 1]} ${parts[0]}`);
  }
  if (parts.length >= 3) {
    keys.add(`${parts[0]} ${parts.slice(1).join(' ')}`);
    keys.add(`${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1]}`);
  }

  return [...keys];
}

export function indexCustomerNameKeys(
  byName: Map<string, string[]>,
  customerId: string,
  firstName?: string,
  lastName?: string
): void {
  const display = formatDisplayName(firstName, lastName);
  if (!display) return;

  for (const key of buildOpenRoNameKeys(display)) {
    appendNameKey(byName, key, customerId);
  }

  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (first && last) {
    for (const key of buildOpenRoNameKeys(`${last}, ${first}`)) {
      appendNameKey(byName, key, customerId);
    }
  }
}

/** Match only when the name resolves to a single customer in the directory. */
export function resolveUniqueCustomerByName(
  byName: Map<string, string[]>,
  displayName: string | undefined,
  dataById: Map<string, Record<string, unknown>>
): { customerId?: string; customer?: Record<string, unknown> } {
  if (!displayName?.trim()) return {};

  for (const key of buildOpenRoNameKeys(displayName)) {
    const ids = byName.get(key);
    if (ids?.length === 1) {
      const customerId = ids[0];
      return { customerId, customer: dataById.get(customerId) };
    }
  }

  return {};
}
