/**
 * The open questions to the person a session can settle, said to it with
 * each turn (sends.ts `presenced`): every question its project holds open,
 * newest first, each one line with its link, its request id, what it is
 * about and how long it has waited. Its session's own questions are there
 * too, so it withdraws one that stopped applying. A session that hears the
 * person answer one, anywhere, records his words with `record_pick`; one
 * that sees the work a question held move on closes it with
 * `question_close` and the evidence (ask-closes.ts).
 *
 * Questions are the project's: its sessions' `ask` questions (pins' among
 * them) and the decision pages and design graphs waiting on him in Needs
 * you (artifacts/needs.ts).
 */

import type { ArtifactNeed } from "@cawco/core/artifact-needs";
import { unparked } from "@cawco/core/artifact-needs";
import { type AskRecord, askLink } from "@cawco/core/asks";
import type { InstanceRow } from "@cawco/core/protocol";
import { reasonLine } from "@cawco/core/words/artifact-needs";
import type { DbShape } from "./db";
import { ago } from "./presenters/words";
import { recordsProjectOf } from "./records-project";

/**
 * The most questions one turn's block lists, newest first; the rest are
 * counted and left to `open_items`. The brief asked for the block to stay
 * brief (tsk-519, item 4).
 */
const LISTED_MAX = 10;

/** One open question to the person, as a session's turn lists it. */
export interface OpenAsk {
  /** When it was asked, ms epoch. */
  at: number;
  /** Its line, without its age. */
  line: string;
}

export interface OpenAsksDeps {
  readonly db: Pick<DbShape, "asks" | "getInstancesByIds" | "workItem">;
  /** Needs you's artifacts as they stand (artifacts/lane.ts). */
  readonly needs: () => readonly ArtifactNeed[];
}

/** A question's line: its link, request id, what it is about, and whose it is when not the reader's. */
const questionLine = (ask: AskRecord, reader: string): string => {
  const { asked } = ask;
  const about =
    asked.kind === "question"
      ? [
          asked.task ? `about ${asked.task}` : "",
          asked.pin ? `on pin ${asked.pin.number}` : "",
          asked.blocks ? "blocks work" : "",
        ].filter(Boolean)
      : [];
  const whose = ask.instanceId === reader ? ["yours"] : [];
  return `- ${askLink(ask)} (${[ask.id, ...about, ...whose].join(", ")})`;
};

export const createOpenAsks = (deps: OpenAsksDeps) => {
  /** Every question the project `reader`'s records live in holds open, newest first. */
  const of = (reader: InstanceRow): OpenAsk[] => {
    const projectId = recordsProjectOf(deps.db, reader);
    const open = deps.db.asks
      .open()
      .filter((ask) => ask.asked.kind === "question");
    const askers = new Map(
      deps.db
        .getInstancesByIds([
          ...new Set([
            ...open.map((ask) => ask.instanceId),
            ...deps.needs().map((need) => need.instanceId),
          ]),
        ])
        .map((row) => [row.id, row] as const)
    );
    const inProject = (instanceId: string, project?: string | null) => {
      if (project) {
        return project === projectId;
      }
      const row = askers.get(instanceId);
      return !!row && recordsProjectOf(deps.db, row) === projectId;
    };
    const questions = open
      .filter((ask) => inProject(ask.instanceId))
      .map((ask) => ({ at: ask.raisedAt, line: questionLine(ask, reader.id) }));
    const pages = unparked(deps.needs())
      .filter((need) => inProject(need.instanceId, need.project))
      .map((need) => ({
        at: need.raisedAt,
        line: `- ${need.link}: ${reasonLine(need.pending)}${need.instanceId === reader.id ? " (yours)" : ""}`,
      }));
    return [...questions, ...pages].sort((a, b) => b.at - a.at);
  };

  return {
    of,
    /**
     * The block a turn of `reader` carries: its project's open questions to
     * the person, newest first, and what to do with one; undefined when
     * none is open.
     */
    block(reader: InstanceRow, now = Date.now()): string | undefined {
      const asks = of(reader);
      if (asks.length === 0) {
        return;
      }
      const listed = asks.slice(0, LISTED_MAX);
      const more = asks.length - listed.length;
      return [
        "Open questions to the person in this project, newest first. When his words anywhere answer one, record them with record_pick; when the work one held has moved on, close it with question_close and the evidence; withdraw your own that stopped applying.",
        ...listed.map((one) => `${one.line} · ${ago(one.at, now)}`),
        ...(more > 0 ? [`${more} more in open_items.`] : []),
      ].join("\n");
    },
  };
};

export type OpenAsks = ReturnType<typeof createOpenAsks>;
