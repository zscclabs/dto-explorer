import dayjs from 'dayjs';

export function bytes(gb: number): string {
  if (gb >= 1024 * 1024) return `${(gb / 1024 / 1024).toFixed(2)} PB`;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function rangeLabel(start: string, end: string): string {
  const s = dayjs(start);
  const e = dayjs(end);
  if (s.isSame(e, 'day')) return s.format('MMM D, YYYY');
  if (s.isSame(e, 'year')) return `${s.format('MMM D')} – ${e.format('MMM D, YYYY')}`;
  return `${s.format('MMM D, YYYY')} – ${e.format('MMM D, YYYY')}`;
}

export function deltaPct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
