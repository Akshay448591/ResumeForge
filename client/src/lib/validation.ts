/**
 * Advisory validation. These helpers return a message to show next to a field.
 * They never block saving, so legitimate-but-unusual input (e.g. "me@sub.example.co.uk",
 * "github.com/me") is never rejected.
 */
export function emailError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)
    ? null
    : "This doesn't look like an email address.";
}

export function urlError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(t)
    ? null
    : "This doesn't look like a web address.";
}

export function normalizeUrl(v: string): string {
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function displayUrl(v: string): string {
  return v
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

export function dateRangeWarning(start: string, end: string, current: boolean): string | null {
  const now = new Date().toISOString().slice(0, 7);
  if (!start && end && !current) return 'Add a start date.';
  if (start && end && !current && end < start) return 'The end date is before the start date.';
  if (start && start > now) return 'The start date is in the future.';
  if (end && !current && end > now) return 'The end date is in the future.';
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonth(v: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim();
}

export function formatRange(start: string, end: string, current: boolean): string {
  const s = formatMonth(start);
  const e = current ? 'Present' : formatMonth(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

export function formatRelative(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];
  let value = diff;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}
