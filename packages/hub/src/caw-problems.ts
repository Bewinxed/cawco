import type { problem } from "elysia";
import type { listFolder, projectRoot } from "./project-folder";

/** A problem of this status and code, its words a string. */
type Problem<Status extends number, Code extends string> = ReturnType<
  typeof problem<Status, { code: Code; detail: string }>
>;

/**
 * What project-joining.ts `leadHome` answers when it cannot say where Caw
 * starts: the project's folder on the hub (the folder's own problems), or a
 * machine that does not say where its home is. Said here, off the folder it
 * reads, because typing it from project-joining.ts closes the cycle caw →
 * project-joining → hub-context → caw.
 */
export type LeadHomeProblem =
  | Extract<
      Awaited<ReturnType<typeof listFolder>> | ReturnType<typeof projectRoot>,
      { readonly "~status": true }
    >
  | Problem<502, "caw-home-unsaid">;

/**
 * Why a send to a project's conversation, or a start of it, goes nowhere
 * (caw.ts `tell`, `conversationFor`), for the files that read them across
 * the cycle caw.ts is in (typing them from caw.ts would close it): one
 * member per code caw.ts answers, so a code it adds is a type error where
 * server.ts wires it.
 */
export type TellProblem =
  | LeadHomeProblem
  | Problem<404, "caw-project-unknown">
  | Problem<409, "caw-no-machine">
  | Problem<409, "caw-off">
  | Problem<409, "caw-send-not-taken">
  | Problem<409, "caw-spend-capped">
  | Problem<409, "caw-start-undone">
  | Problem<502, "caw-failed">;
