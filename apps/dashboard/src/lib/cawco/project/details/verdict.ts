/**
 * The card's top line, rolled up from its sections: whether agents can
 * start, and the section in trouble. A roll-up, never a second copy of a
 * row's message: the row holds the full words and the fix.
 */

import { cardWords, sectionWords } from "@cawco/core/words/project-details";
import type { Details } from "./details";

/** The section a verdict names, and which section's row its press moves focus to. */
export type Trouble = "files" | "ai" | "tasks";

export type Verdict =
  | { tone: "reading" }
  | { tone: "away"; text: string }
  | { tone: "running"; text: string }
  | { tone: "blocked"; text: string; section: Trouble }
  | { tone: "look"; text: string; section: Trouble }
  | { tone: "ok"; text: string };

const sectionName = (section: Trouble): string => sectionWords[section].name;

export function verdictOf(details: Details): Verdict {
  if (!details.hub.reachable) {
    return {
      tone: "away",
      text: cardWords.stopped(details.hub.host, details.hub.readAt),
    };
  }
  const { folders, ai, tasks } = details;
  if (folders.state === "reading" || ai.state === "reading") {
    return { tone: "reading" };
  }
  if (details.running) {
    return { tone: "running", text: details.running.says };
  }
  const list = folders.state === "read" ? folders.value : [];
  if (list.some((folder) => folder.role === "main" && folder.missing)) {
    return { tone: "blocked", text: cardWords.cantStart, section: "files" };
  }
  if (ai.state === "read") {
    const { accounts, chosen } = ai.value;
    const named = accounts.find((account) => account.id === chosen);
    const none = !accounts.some((account) => account.signedIn);
    if ((named && !named.signedIn) || (chosen === null && none)) {
      return { tone: "blocked", text: cardWords.cantStart, section: "ai" };
    }
  }
  if (list.some((folder) => folder.missing)) {
    return { tone: "look", text: cardWords.canStart, section: "files" };
  }
  if (
    tasks.state === "read" &&
    tasks.value.kind !== "here" &&
    tasks.value.standing.state === "read" &&
    tasks.value.standing.value.state === "refused"
  ) {
    return { tone: "look", text: cardWords.canStart, section: "tasks" };
  }
  return { tone: "ok", text: cardWords.canStart };
}

export { sectionName };
