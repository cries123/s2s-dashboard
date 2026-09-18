import type { Customer } from '../types';

/**
 * House / internal accounts.
 *
 * The dealership itself, loaners, demos and shop vehicles end up in the customer
 * collection because the DMS treats them as contacts. They are not people to call,
 * so they must never appear in Service Alerts.
 *
 * Detection is the explicit `isHouseAccount` flag first, then a conservative name and
 * phone match. A false positive here only removes a card from the call list — it never
 * touches the record — so erring toward the flag is the right trade-off.
 */

const HOUSE_NAME_PATTERNS: RegExp[] = [
  /\bhyundai of\b/i,
  /\bford\s*\/?\s*lincoln\b/i,
  /\bnissan\s*\/?\s*mazda\b/i,
  /\bsanta maria\b/i,
  /\bdealership\b/i,
  /\bdealer\b/i,
  /\binternal\b/i,
  /\bhouse account\b/i,
  /\bloaner\b/i,
  /\bshop (?:vehicle|truck|car)\b/i,
  /\bdemo\b/i,
  /\bservice dept\b/i,
  /\bparts dept\b/i,
];

/** Store main lines. A customer record carrying one of these is the store itself. */
const HOUSE_PHONES = new Set(['8053498500']);

function digits(value: string | undefined | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function isHouseAccountCustomer(customer: Pick<Customer, 'firstName' | 'lastName' | 'phone' | 'isHouseAccount'>): boolean {
  if (customer.isHouseAccount === true) return true;
  if (customer.isHouseAccount === false) return false;

  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
  if (fullName && HOUSE_NAME_PATTERNS.some((re) => re.test(fullName))) return true;

  const phone = digits(customer.phone);
  if (phone && HOUSE_PHONES.has(phone.slice(-10))) return true;

  return false;
}
