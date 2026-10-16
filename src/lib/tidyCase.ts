/**
 * PBS sends names, vehicles and concerns in capitals ("RAMOS, CRYSTAL",
 * "2024 HYUNDAI TUCSON"). Shouting text is the fastest way to look unfinished.
 * Only rewrites strings that are mostly upper-case; anything typed normally is left alone.
 *
 * Lives in lib so plain helpers (customer names) can use it; the UI imports it
 * through components/ui/Panel as before.
 */
export function tidyCase(s: string | null | undefined, mode: 'title' | 'sentence' = 'title'): string {
  if (!s) return '';
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3 || letters !== letters.toUpperCase()) return s;
  const lower = s.toLowerCase();
  const KEEP = new Set(['ac', 'a/c', 'suv', 'awd', 'fwd', 'rwd', 'ev', 'vin', 'ro', 'gl', 'gls', 'sel', 'se', 'hev', 'phev', 'abs', 'tpms', 'cel']);
  if (mode === 'sentence') {
    return lower
      .replace(/[a-z][a-z'/]*/g, (w) => (KEEP.has(w) ? w.toUpperCase() : w))
      .replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
  }
  return lower.replace(/[a-z][a-z'/]*/g, (w) => (KEEP.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
}

/** "RAMOS, CRYSTAL" -> "Crystal Ramos". */
export function tidyPersonName(s: string | null | undefined): string {
  const t = tidyCase(s);
  const m = t.match(/^\s*([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : t;
}

/**
 * A name, as opposed to a vehicle or a concern: the vehicle-code exceptions in
 * tidyCase ("SE", "EV", "RO") are not words in anyone's name.
 */
export function tidyNamePart(s: string | null | undefined): string {
  if (!s) return '';
  const letters = s.replace(/[^A-Za-z]/g, '');
  // Short all-caps names ("AL", "JO") are still shouting; only leave mixed case alone.
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/[a-z][a-z']*/g, (w) => w[0].toUpperCase() + w.slice(1))
    // O'Brien, D'Angelo: a one-letter prefix before the apostrophe.
    .replace(/\b([A-Z])'([a-z])/g, (_, a: string, b: string) => `${a}'${b.toUpperCase()}`);
}
