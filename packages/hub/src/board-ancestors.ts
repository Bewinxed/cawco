/**
 * The board carries every listed row's ancestors, so a client always holds
 * the session a row nests under: a delegate still working under a parent
 * that stopped days ago comes with that parent, and stands under it in
 * every rail rather than at a project's top. A row whose chain names a
 * session the hub no longer has (deleted, discarded, a removed machine's)
 * is dropped with everything under it: it has nowhere to nest, and nothing
 * but a person's own session stands at a project's top.
 *
 * A routine's run and a design check's verifier name the hub's own parent
 * (work-items.ts `isHubParent`), which no row is: their chain ends there,
 * and they stay on the board for the views that read them.
 */

/** A row as the chain reads it: its id and the session that started it. */
export interface NestedRow {
  id: string;
  parentInstanceId: string | null;
}

/**
 * `listed`, each row whose chain of parents resolves, then every ancestor
 * they nest under that `listed` does not hold, each once. `find` resolves
 * ids `listed` does not hold (rows the board keeps, else the database);
 * `endsChain` names a parent id that is no session's and ends a chain.
 */
export const withAncestors = <Row extends NestedRow>(
  listed: readonly Row[],
  find: (ids: string[]) => ReadonlyMap<string, Row>,
  endsChain: (parentId: string) => boolean
): Row[] => {
  const byId = new Map(listed.map((row) => [row.id, row] as const));
  const parentOf = (row: Row): string | null => {
    const parent = row.parentInstanceId;
    return parent && parent !== row.id && !endsChain(parent) ? parent : null;
  };
  const missing = new Set<string>();
  let wanted = new Set<string>();
  for (const row of listed) {
    const parent = parentOf(row);
    if (parent && !byId.has(parent)) {
      wanted.add(parent);
    }
  }
  const carried: Row[] = [];
  while (wanted.size > 0) {
    const found = find([...wanted]);
    const next = new Set<string>();
    for (const id of wanted) {
      const row = found.get(id);
      if (!row) {
        missing.add(id);
        continue;
      }
      byId.set(id, row);
      carried.push(row);
      const parent = parentOf(row);
      if (parent && !(byId.has(parent) || missing.has(parent))) {
        next.add(parent);
      }
    }
    wanted = next;
  }
  /** Whether a row's whole chain resolves; a cycle resolves where it closes. */
  const resolved = new Map<string, boolean>();
  const resolves = (row: Row): boolean => {
    const chain: Row[] = [];
    const seen = new Set<string>();
    let at: Row | undefined = row;
    let answer = true;
    while (at) {
      const known = resolved.get(at.id);
      if (known !== undefined) {
        answer = known;
        break;
      }
      if (seen.has(at.id)) {
        break;
      }
      seen.add(at.id);
      chain.push(at);
      const parent = parentOf(at);
      if (!parent) {
        break;
      }
      at = byId.get(parent);
      if (!at) {
        answer = false;
      }
    }
    for (const each of chain) {
      resolved.set(each.id, answer);
    }
    return answer;
  };
  return [...listed, ...carried].filter(resolves);
};
