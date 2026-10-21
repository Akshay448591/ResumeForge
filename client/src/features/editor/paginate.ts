/** An entry no taller than this stays in one piece when it would cross a page boundary. */
export const ATOMIC_MAX = 170;

export interface UnitBox {
  id: string;
  kind: 'heading' | 'head' | 'atom' | 'entry';
  top: number;
  bottom: number;
  /** Set when this unit sits inside a tall entry that is allowed to split, and is not its first unit. */
  splitOf?: string;
}

export interface PaginationResult {
  /** Extra space (px) to insert before a unit so it starts on the next page. */
  shifts: Record<string, number>;
  /** Entries that continue across a page boundary. */
  splitEntries: string[];
  /** Largest empty gap left at the bottom of a page. */
  maxGap: number;
  /** True when content is wider than the page. */
  overflowX: boolean;
}

/**
 * Pure pagination: given measured blocks per column, decide where to push content to the next page.
 * - headings and entry header rows stay with the block that follows them
 * - short entries are never split
 * - every page keeps its top and bottom margin
 */
export function computeShifts(columns: UnitBox[][], margin: number, pageH: number) {
  const shifts: Record<string, number> = {};
  const splits = new Set<string>();
  let maxGap = 0;
  const usable = pageH - margin * 2;

  for (const units of columns) {
    let cum = 0;
    let lastBottom: number | null = null;
    units.forEach((u, i) => {
      const next = units[i + 1];
      const keepNext = (u.kind === 'heading' || u.kind === 'head') && next;
      const top = u.top + cum;
      const bottom = (keepNext ? next.bottom : u.bottom) + cum;
      const page = Math.floor(top / pageH);
      let delta = 0;
      if (page > 0 && top < page * pageH + margin) {
        delta = page * pageH + margin - top;
      } else {
        const limit = (page + 1) * pageH - margin;
        if (bottom > limit && bottom - top <= usable) {
          delta = (page + 1) * pageH + margin - top;
          if (lastBottom !== null) maxGap = Math.max(maxGap, limit - lastBottom);
        }
      }
      if (delta > 0) {
        delta = Math.ceil(delta);
        shifts[u.id] = delta;
        cum += delta;
        if (u.splitOf) splits.add(u.splitOf);
      }
      lastBottom = u.bottom + cum;
    });
  }
  return { shifts, splitEntries: [...splits], maxGap: Math.round(maxGap) };
}

/** Measure an unshifted copy of the resume and work out the page breaks. */
export function paginate(root: HTMLElement, margin: number, pageH: number): PaginationResult {
  const rootTop = root.getBoundingClientRect().top;
  const columns: UnitBox[][] = [];

  root.querySelectorAll<HTMLElement>('[data-col]').forEach((col) => {
    const units: UnitBox[] = [];
    let atomic: HTMLElement | null = null;
    col.querySelectorAll<HTMLElement>('[data-pg]').forEach((el) => {
      if (atomic && atomic.contains(el)) return;
      const r = el.getBoundingClientRect();
      const kind = (el.dataset.pg ?? 'atom') as UnitBox['kind'];
      if (kind === 'entry') {
        const hasParts = el.querySelector('[data-pg]') !== null;
        if (r.height > ATOMIC_MAX && hasParts) return; // its parts are the units
        atomic = el;
      }
      let splitOf: string | undefined;
      const entry = el.parentElement?.closest<HTMLElement>('[data-pg="entry"]');
      if (entry && entry.querySelector('[data-pg]') !== el) {
        splitOf = entry.dataset.pgLabel || 'An entry';
      }
      units.push({
        id: el.dataset.pgId ?? '',
        kind,
        top: r.top - rootTop,
        bottom: r.bottom - rootTop,
        splitOf,
      });
    });
    columns.push(units);
  });

  const result = computeShifts(columns, margin, pageH);
  return { ...result, overflowX: root.scrollWidth > root.clientWidth + 1 };
}
