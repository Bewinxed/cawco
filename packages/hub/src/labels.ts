import type { HarnessKind } from "@cawco/core/harness/kinds";
import { shortId } from "@cawco/core/short-id";

/**
 * How the hub names a session, everywhere it names one: peer frames, reports,
 * delegate rosters, the delegation tree, pushes, ask cards, work items.
 *
 * `name` is the leaf of the folder it was launched in, and `tag` is
 * `name#id8`. A session whose launch directory is unknown (its machine had no
 * record of its conversation, `instances.launch_dir`) may hold a folder its
 * CLI wandered into in `cwd`, so it is named by its title, else its harness
 * (`harness#id8`), and never by that folder. A routine or a design check
 * runs on no harness (work-item-state.ts `Parent`): it is a `session`.
 */
export type LabelledRow = {
  harness: HarnessKind | null;
  id: string;
  title?: string | null;
} & (
  | { cwd: string; launchDir: "known" | "unread" }
  /** Its folder is never read: `cwd` may be one its CLI wandered into, or none known at all. */
  | { cwd?: string; launchDir: "unknown" }
);

/** The last segment of a path. */
export const leafOf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/** `dir`, the whole launch directory, is how a listing shows where it lives. */
export const sessionLabel = (
  row: LabelledRow
): { dir: string; name: string; tag: string } => {
  const id8 = shortId(row.id);
  if (row.launchDir === "unknown") {
    const harness = row.harness ?? "session";
    const dir = "launch folder unknown";
    return row.title
      ? { dir, name: row.title, tag: row.title }
      : { dir, name: harness, tag: `${harness}#${id8}` };
  }
  const name = leafOf(row.cwd);
  return { dir: row.cwd, name, tag: `${name}#${id8}` };
};

/**
 * A session as the board names it: its given title (the owner's or its own),
 * else the title its first message gave it, else its {@link sessionLabel}.
 */
export const boardTitle = (
  row: LabelledRow & { derivedTitle?: string | null }
): string =>
  row.title?.trim() || row.derivedTitle?.trim() || sessionLabel(row).name;
