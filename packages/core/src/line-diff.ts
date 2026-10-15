/**
 * Lines and the line diff of two texts, as a diff draws them: one model for
 * every count the surfaces show (a tool row's "+2 −1", a permission card's
 * "3 lines changed", Telegram's "+3 −1"), so none of them can count what
 * DiffView, DiffView.swift or @pierre/diffs would not draw.
 *
 * A line keeps its terminator. A trailing newline therefore ends the last
 * line rather than opening an empty one ("a\nb\n" is two lines, as "a\nb"
 * is), and a last line without one differs from the same line with one, as
 * git's "\ No newline at end of file" has it.
 */

/** Past this many cells the line table is not built: every line on each side counts as changed. */
const TABLE_CAP = 4_000_000;

const LINE = /[^\n]*\n|[^\n]+$/g;

/** A text's lines, each with its newline when it has one. */
export const linesOf = (source: string): string[] => source.match(LINE) ?? [];

/** Where two line lists stop agreeing: the common head's length and the common tail's. */
function commonEnds(a: string[], b: string[]): { head: number; tail: number } {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a.at(-1 - tail) === b.at(-1 - tail)
  ) {
    tail += 1;
  }
  return { head, tail };
}

/** The LCS table over `a[head, head+n)` and `b[head, head+m)`: cell (i, j) is the LCS length of their suffixes. */
function lcsTable(
  a: string[],
  b: string[],
  head: number,
  n: number,
  m: number
): Uint32Array {
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[head + i] === b[head + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  return table;
}

/**
 * The changed lines of two line lists: indexes into `a` removed, into `b`
 * added. An LCS over the lines between the common head and tail, the same
 * script the diff views draw on inputs this size.
 */
export function editScript(
  a: string[],
  b: string[]
): { removedAt: number[]; addedAt: number[] } {
  const { head, tail } = commonEnds(a, b);
  const n = a.length - head - tail;
  const m = b.length - head - tail;
  const removedAt: number[] = [];
  const addedAt: number[] = [];
  if (n * m > TABLE_CAP || n === 0 || m === 0) {
    for (let i = 0; i < n; i += 1) {
      removedAt.push(head + i);
    }
    for (let j = 0; j < m; j += 1) {
      addedAt.push(head + j);
    }
    return { removedAt, addedAt };
  }
  const width = m + 1;
  const table = lcsTable(a, b, head, n, m);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[head + i] === b[head + j]) {
      i += 1;
      j += 1;
    } else if (
      j < m &&
      (i === n || table[i * width + j + 1] >= table[(i + 1) * width + j])
    ) {
      addedAt.push(head + j);
      j += 1;
    } else {
      removedAt.push(head + i);
      i += 1;
    }
  }
  return { removedAt, addedAt };
}

/** How many lines going from `before` to `after` adds and removes. */
export function lineCounts(
  before: string,
  after: string
): { added: number; removed: number } {
  const { removedAt, addedAt } = editScript(linesOf(before), linesOf(after));
  return { added: addedAt.length, removed: removedAt.length };
}
