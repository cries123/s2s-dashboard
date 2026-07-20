/** Format up to 10 US digits as (XXX) XXX-XXXX while typing. */
export function formatPhoneAsYouType(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  const d = digits.slice(0, 10);
  if (!d.length) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Format stored phone values for display in inputs. */
export function formatPhoneDisplay(raw?: string | null): string {
  if (!raw?.trim()) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) return formatPhoneAsYouType(raw);
  return raw.trim();
}
