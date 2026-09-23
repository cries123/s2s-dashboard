/**
 * Logging that ends up in the check result, so the dashboard can show what
 * happened. Everything passes through redact(): the extension never touches
 * credentials or tokens, but a page's text can contain customer details and a
 * log line must not carry them out of the tab.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGITS = /\d{7,}/g;
const VIN_LIKE = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

export function redact(value) {
  return String(value ?? '')
    .replace(EMAIL, '[email]')
    .replace(VIN_LIKE, '[vin]')
    .replace(LONG_DIGITS, (m) => '[' + m.length + ' digits]');
}

function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function createLogger(prefix) {
  const entries = [];
  const push = (level, message) => {
    const line = `${stamp()} ${level} ${redact(message)}`;
    entries.push(line);
    const fn = level === 'WARN' ? console.warn : level === 'ERR' ? console.error : console.info;
    fn(`[${prefix}] ${line}`);
  };
  return {
    info: (m) => push('INFO', m),
    warn: (m) => push('WARN', m),
    error: (m) => push('ERR', m),
    entries,
  };
}
