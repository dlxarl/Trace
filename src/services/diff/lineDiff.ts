/** Small line diff (LCS) for comparing two versions of one Markdown file. */
export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string };

const MAX_LINES = 1500;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [{ kind: 'same', text: `(file too large to compare: ${a.length} → ${b.length} lines)` }];
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: 'del', text: a[i++] });
    else out.push({ kind: 'add', text: b[j++] });
  }
  while (i < n) out.push({ kind: 'del', text: a[i++] });
  while (j < m) out.push({ kind: 'add', text: b[j++] });
  return out;
}

/** Keeps changed lines with `context` unchanged lines around them. */
export function collapseDiff(lines: DiffLine[], context = 2): (DiffLine | { kind: 'gap'; hidden: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { kind: 'gap'; hidden: number })[] = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) out.push({ kind: 'gap', hidden });
      hidden = 0;
      out.push(l);
    } else hidden++;
  });
  if (hidden) out.push({ kind: 'gap', hidden });
  return out;
}
