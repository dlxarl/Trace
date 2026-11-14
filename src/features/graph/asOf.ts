import { parsePartialDate, type Relationship } from '@/types';

/** Last millisecond covered by a partial date: "2022" → end of 2022, "2022-03" → end of March. */
function endOf(d: NonNullable<ReturnType<typeof parsePartialDate>>): number {
  const dt = new Date(d.ms);
  if (d.precision === 'year') return Date.UTC(dt.getUTCFullYear() + 1, 0, 1) - 1;
  if (d.precision === 'month') return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) - 1;
  return d.ms + 24 * 3600 * 1000 - 1;
}

/**
 * Was the relationship in effect at `asOf` (YYYY, YYYY-MM or YYYY-MM-DD)?
 * A link without dates is always shown — nothing says it ended. A year or month
 * counts as the whole period, so "2021" matches a link that ran 2020-06 → 2021-02.
 * An unusable `asOf` shows everything.
 */
export function activeAt(rel: Pick<Relationship, 'valid_from' | 'valid_to'>, asOf: string): boolean {
  const at = parsePartialDate(asOf);
  if (!at) return true;
  const from = parsePartialDate(rel.valid_from);
  const to = parsePartialDate(rel.valid_to);
  if (from && from.ms > endOf(at)) return false;
  if (to && endOf(to) < at.ms) return false;
  return true;
}
