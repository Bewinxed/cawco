/**
 * A preview origin, by what it serves: a session's panel (its key the
 * session's id), a project's pages (db/previews.ts `projectOrigin`), or a
 * machine artifact's own origin (`embed`, db/previews.ts `artifactOrigin`).
 * Its key is what `previews` rows and every listener map store, unchanged.
 */
import { originOfKey, projectOfOrigin } from "./db/previews";

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

/** Whether origin key `key` is a machine artifact's own origin. */
export const isEmbed = (key: string): boolean => originOf(key).kind === "embed";
