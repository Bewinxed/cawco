/**
 * A preview origin, by what it serves: a session's panel (its key the
 * session's id), a project's pages (db/previews.ts `projectOrigin`), or a
 * machine artifact's own origin (`embed`, db/previews.ts `artifactOrigin`).
 * Its key is what `previews` rows and every listener map store, unchanged.
 */
import { artifactOrigin, originOfKey, projectOfOrigin } from "./db/previews";

type Origin =
  | { kind: "session"; key: string; session: string }
  | { kind: "project"; key: string; project: string }
  | { kind: "embed"; key: string; origin: string };

/** The origin preview origin key `key` names. */
const originOf = (key: string): Origin => {
  const project = projectOfOrigin(key);
  if (project !== null) {
    return { kind: "project", key, project };
  }
  const origin = originOfKey(key);
  return origin === null
    ? { kind: "session", key, session: key }
    : { kind: "embed", key, origin };
};

/**
 * A machine artifact's own origin (a dev server's or a folder's preview, a
 * sheet), which its session's panel, its own tab and every decision page's
 * Preview of it load: its listener on a port of its own and its machine's
 * listener are keyed by the origin its row points at (schema.ts
 * `artifacts.origin`), apart from every session's, and both last as long as
 * that origin, whichever session opened or held it (preview-service.ts
 * `end`); its port stays its own until the range is full and it is the
 * least recently used of those nothing uses (`reclaimOne`). A dev server
 * and a stage serve from their root, so no other origin can show one under
 * a path of its own; the machine keys its listener by the same key.
 */
export const embedKey = (origin: string): string => artifactOrigin(origin);

/** Whether origin key `key` is a machine artifact's own origin. */
export const isEmbed = (key: string): boolean => originOf(key).kind === "embed";
