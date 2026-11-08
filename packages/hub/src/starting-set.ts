/**
 * The set a session starts with (core `StartingSet`, tsk-329): its delegate
 * type's set when the type names one, otherwise its project's
 * (project-starting-set.ts), otherwise none, and everything installed. To a
 * set it takes are joined CawCo's own skills and server, its project
 * template's starter skills and the skills its start named. Resolved once,
 * as its row first opens (server.ts `startingSetOf`), and kept on that row,
 * so a later change to the type or the project reaches only sessions
 * started after it: a harness can refuse a conversation whose tools change
 * partway.
 */
import { CAWCO_SERVER, type StartingSet } from "@cawco/core/delegate-types";
import { BUNDLED_SKILLS } from "./bundled-skills";

/** What a session's set is resolved from, as it starts. */
export interface SetSources {
  /** The skills its start named: a `delegate` call's, or its type's own `skills`. */
  named?: readonly string[];
  /** Its project's set ({@link import("./project-starting-set").projectStartingSet}); absent: none. */
  project?: StartingSet;
  /** Its project template's starter skills (bundled-skills.ts `TEMPLATE_SKILLS`), so a set still does the project's built-in work. */
  starters?: readonly string[];
  /** Its delegate type's set; absent: the type names none, or it has no type. */
  type?: StartingSet;
}

/**
 * What a session starts with: undefined when neither its type nor its
 * project names a set (everything installed). Otherwise the type's set, else
 * the project's, with the skills CawCo ships ({@link BUNDLED_SKILLS}) so
 * decision pages, previews and its event skills keep working, its template's
 * starter skills, the skills its start named, and CawCo's own server.
 */
export const sessionStartingSet = ({
  type,
  project,
  starters,
  named,
}: SetSources): StartingSet | undefined => {
  const set = type ?? project;
  if (!set) {
    return undefined;
  }
  return {
    skills: [
      ...new Set([
        ...set.skills,
        ...BUNDLED_SKILLS,
        ...(starters ?? []),
        ...(named ?? []),
      ]),
    ],
    servers: [...new Set([...set.servers, CAWCO_SERVER])],
  };
};
