/** The routing record's sentences for a decided card. */

import type { SettledBy } from "../choices";
import type { Kind, RouteState } from "../decides";
import { unhandled } from "../unhandled";
import { decidesWords } from "./decides";

/** The fleet's kinds as every session's instructions list them: `Kinds: look (layout, copy, …) · …`. */
export const kindsLine = (kinds: readonly Kind[]): string =>
  decidesWords.kindsLine(
    kinds.map((kind) => `${kind.id} (${kind.example})`).join(" · ")
  );

/**
 * A member's answer in words: "Decided by Advisor · Claude Code · Opus 5.5
 * · why · 2 sources"; the person's own pick says nothing more than it does.
 */
export const decidedByLine = (
  settled: Pick<SettledBy, "name" | "runs" | "sources" | "why">
): string =>
  [
    decidesWords.decidedBy(settled.name, settled.runs),
    settled.why,
    ...(settled.sources.length > 0
      ? [decidesWords.sources(settled.sources.length)]
      : []),
  ].join(" · ");

/** Where a card goes, said to the session that wrote it, after the card's link (one line per card). */
export const routeLine = (
  kind: string,
  member: string,
  where: "project" | "fleet",
  state: RouteState
): string => {
  const here = decidesWords.here(where === "project");
  switch (state.state) {
    case "you":
      return decidesWords.routedYou(kind, here);
    case "asker":
      return decidesWords.routedAsker(kind, here);
    case "failed":
      return decidesWords.routedFailed(kind, member, here, state.why);
    case "unreachable":
      return decidesWords.routedUnreachable(kind, member, here, state.reason);
    case "running":
      return decidesWords.routedMember(kind, member, here);
    default:
      return unhandled("route state", state);
  }
};
