import type { SettledBy } from "@cawco/core/choices";
import type { Member } from "@cawco/core/decides";
import type { problem } from "elysia";
import type { FolderProblem } from "./decision-page";

/** What settling.ts `routed` answers: each card's line by its id, or the folder's refusal when the table does not read off it. */
export type CardsRouted = Record<string, string> | FolderProblem;

/** The member a session settles a card for, and how it signs (settling.ts `settler`). */
export type Signing = Pick<SettledBy, "by" | "name" | "runs"> & {
  member: Member;
};

/** Why a session may not settle a card: a card the person decides is his alone, the asker's is its writer's, an agent member's is its session's (settling.ts `settler`). */
export type SettleProblem =
  | ReturnType<
      typeof problem<403, { code: "settle-asker-writer-only"; detail: string }>
    >
  | ReturnType<
      typeof problem<403, { code: "settle-yours-only"; detail: string }>
    >
  | ReturnType<
      typeof problem<403, { code: "settle-member-only"; detail: string }>
    >;

/** What settling.ts `settler` answers: how it signs, or why it may not. The folder's refusal when the table does not read off it. */
export type Settler = Signing | SettleProblem | FolderProblem;
