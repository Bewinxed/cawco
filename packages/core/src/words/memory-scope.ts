/** A memory document's scope as a sentence. */

import type { MemoryScope } from "../fleet";
import { areaWords } from "./areas";
import { memoryWords } from "./memory";

/** Names in a sentence: `A`, `A and B`, `A, B and C`. */
const listed = (names: readonly string[]): string =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")}${memoryWords.scopeAnd}${names.at(-1)}`;

/**
 * The sessions a scope loads a document into, in a few words, each project
 * by the name `projectName` gives it: what the dashboard's memory editor
 * and an `admin_memory_write` ask both say.
 */
export const scopeWords = (
  scope: MemoryScope | undefined,
  projectName: (id: string) => string,
  areaName: (id: string) => string = (id) => id
): string => {
  const words = memoryWords;
  const types = scope?.delegateTypes?.length
    ? words.scopeDelegates(listed(scope.delegateTypes))
    : undefined;
  const model = scope?.model ? words.scopeOnModels(scope.model) : undefined;
  if (scope?.briefer) {
    const about = [types ?? words.scopeAnyDelegate, model]
      .filter(Boolean)
      .join(" ");
    return words.scopeBriefing(about);
  }
  const role = scope?.role;
  const named = [
    ...(scope?.projectIds ?? []).map(projectName),
    ...(scope?.areaIds ?? []).map((id) => areaWords.scopeArea(areaName(id))),
  ];
  const projects = named.length > 0 ? listed(named) : undefined;
  const who = [
    role
      ? `${role === "orchestrator" ? words.orchestrator : words.leaf}`
      : undefined,
    types,
  ].filter(Boolean);
  const subject =
    who.length > 0 ? words.scopeSessionsOf(who.join(" ")) : undefined;
  const narrowing = [
    model,
    projects ? words.scopeIn(projects) : undefined,
  ].filter(Boolean);
  if (!(subject || narrowing.length > 0)) {
    return words.scopeNone;
  }
  if (subject && narrowing.length === 0 && !types && role) {
    return words.scopeEvery(role);
  }
  if (!subject && projects && !model) {
    return words.scopeEveryIn(projects);
  }
  return [subject ?? words.scopeSessions, ...narrowing].join(" ");
};
