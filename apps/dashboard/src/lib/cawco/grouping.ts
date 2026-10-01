/**
 * Sessions that share a working directory, folded for the rail: a directory
 * with two or more sessions in a list becomes one group, and a directory with
 * one stays a plain row. Order is preserved — a group stands where its first
 * member stood, and members keep their list order.
 */
export interface CwdGroup<T> {
  cwd: string;
  rows: T[];
}

export function groupByCwd<T extends { cwd: string }>(
  rows: T[]
): Array<T | CwdGroup<T>> {
  const byCwd = new Map<string, T[]>();
  for (const row of rows) {
    const seen = byCwd.get(row.cwd);
    if (seen) {
      seen.push(row);
    } else {
      byCwd.set(row.cwd, [row]);
    }
  }

  const emitted = new Set<string>();
  const result: Array<T | CwdGroup<T>> = [];
  for (const row of rows) {
    const members = byCwd.get(row.cwd) ?? [];
    if (members.length === 1) {
      result.push(row);
      continue;
    }
    if (emitted.has(row.cwd)) {
      continue;
    }
    emitted.add(row.cwd);
    result.push({ cwd: row.cwd, rows: members });
  }
  return result;
}

/**
 * Whether an entry is a folded directory rather than a single row. `rows` is
 * the discriminant; none of the session shapes this folds carries that name.
 */
export const isCwdGroup = <T extends { cwd: string }>(
  entry: T | CwdGroup<T>
): entry is CwdGroup<T> =>
  "rows" in entry && Array.isArray((entry as CwdGroup<T>).rows);
