/**
 * The set a session starts with (core `StartingSet`, tsk-329): its delegate
 * type's skills and servers, with CawCo's own and the skills its start named
 * joined. Resolved once, as its row first opens (server.ts `issueSpawn`), and
 * kept on that row, so a later change to the type reaches only sessions
 * started after it: a harness can refuse a conversation whose tools change
 * partway.
 */
import { CAWCO_SERVER, type DelegateType, type StartingSet } from "@cawco/core";
import { BUNDLED_SKILLS } from "./bundled-skills";

/**
 * What a session of `type` starts with: undefined when the type names no
 * set (everything installed). Otherwise its set, with the skills CawCo ships
 * ({@link BUNDLED_SKILLS}) so decision pages, previews and its event skills
 * keep working, the skills its start named (`named`: a `delegate` call's, or
 * its type's own `skills`), and CawCo's own server.
 */
export const sessionStartingSet = (
  type: Pick<DelegateType, "startingSet"> | undefined,
  named: readonly string[] | undefined
): StartingSet | undefined => {
  const set = type?.startingSet;
  if (!set) {
    return undefined;
  }
  return {
    skills: [...new Set([...set.skills, ...BUNDLED_SKILLS, ...(named ?? [])])],
    servers: [...new Set([...set.servers, CAWCO_SERVER])],
  };
};
