/**
 * How the hub names a session, everywhere it names one: peer frames, reports,
 * delegate rosters, the delegation tree, Telegram, ask cards, work items.
 *
 * `name` is the leaf of the folder it was launched in, and `tag` is
 * `name#id8`. A session whose launch directory is unknown (its machine had no
 * record of its conversation, `instances.launch_dir`) may hold a folder its
 * CLI wandered into in `cwd`, so it is named by its title, else its harness
 * (`harness#id8`), and never by that folder.
 */
export interface LabelledRow {
  cwd: string;
  harness?: string | null;
  id: string;
  launchDir: "known" | "unread" | "unknown";
  title?: string | null;
}

/** The last segment of a path. */
export const leafOf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/** `dir`, the whole launch directory, is how a listing shows where it lives. */
export const sessionLabel = (
  row: LabelledRow
): { dir: string; name: string; tag: string } => {
  const id8 = row.id.slice(0, 8);
  if (row.launchDir === "unknown") {
    const harness = row.harness || "session";
    const dir = "launch folder unknown";
    return row.title
      ? { dir, name: row.title, tag: row.title }
      : { dir, name: harness, tag: `${harness}#${id8}` };
  }
  const name = leafOf(row.cwd);
  return { dir: row.cwd, name, tag: `${name}#${id8}` };
};
