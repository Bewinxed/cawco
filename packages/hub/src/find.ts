/**
 * Find, as the hub's thread asks it: the engine runs on the views thread
 * (views/find-engine.ts), off this one, and every page, listing, Jump's
 * waiting list and a session named by id is asked of it by message
 * (views/client.ts). This thread does what only it can for it: it holds
 * the machines' sockets, so the engine's searches of their transcripts and
 * its listings of their catalogs are asked through here; it knows which
 * machines are online and which sessions wait on the person, which each
 * ask carries; and it answers the routes.
 */

import type { ArtifactNeedsRead } from "@cawco/core/artifact-needs";
import {
  FIND_KINDS,
  type FindAnswer,
  type FindBy,
  type FindConversation,
  type FindCoverage,
  type FindKind,
  type FindResult,
  type MomentAuthor,
  type WaitingAnswer,
} from "@cawco/core/find";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import { ElysiaStatus, problem, t } from "elysia";
import type { ViewsThread } from "./views/client";
import type {
  FindRequest as EngineRequest,
  WaitingFrom,
} from "./views/find-engine";
import { DEFAULT_LIMIT } from "./views/pages";
import type { LiveFacts } from "./views/wire";

/** What a page of a find is asked for (views/find-engine.ts `FindRequest`), with its asker's signal. */
export type FindRequest = Omit<EngineRequest, "requestId"> & {
  /**
   * Aborts once the asker no longer waits (the person typed on, closed
   * Find): the machines are told to stop the search (core `CONTROL_ABANDON`).
   */
  signal?: AbortSignal;
};

/** The offset a cursor this hub gave starts at; 0 for none; or the refusal of one it did not give. */
export const decodeCursor = (cursor: string | undefined) => {
  if (!cursor) {
    return 0;
  }
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(offset) || offset < 0) {
    return cursorRefused(cursor);
  }
  return offset;
};

const cursorRefused = (cursor: string) =>
  problem(400, {
    code: "find-cursor-unknown",
    detail: `"${cursor}" is not a cursor this hub gave.`,
  });

export interface FindDeps {
  /** What every ask carries: the machines online, the sessions waiting on the person. */
  live: () => LiveFacts;
  /**
   * The change log taken, so the views thread hears every write made before
   * this ask ahead of it (board.ts `settle`: one ordered line of messages).
   */
  settle: () => void;
  views: ViewsThread;
  /** Needs you's artifacts, and the tasks waiting in a stage of yours, for Jump's waiting list. */
  waitingFrom: () => Promise<{
    lane: ArtifactNeedsRead;
    tasks: WaitingFrom["tasks"];
  }>;
}

export const createFind = (deps: FindDeps) => {
  const { views } = deps;
  return {
    /** One page of a find, or the refusal of a cursor this hub did not give. */
    async find(request: FindRequest) {
      const { signal, ...asked } = request;
      // Its asker gone (a newer keystroke) before the log is taken: no work.
      signal?.throwIfAborted();
      deps.settle();
      const page = await views.withRequest(signal, (requestId) =>
        views.find({ live: deps.live(), request: { ...asked, requestId } })
      );
      return "cursor" in page ? cursorRefused(page.cursor) : page;
    },
    /** A listing whole, unpaged: `request.author`'s words in its window, newest first, for an agent's find (find-tool.ts). */
    listing(
      request: Omit<FindRequest, "cursor" | "limit" | "q"> & {
        author: MomentAuthor;
      }
    ): Promise<{
      atLimit: boolean;
      coverage: FindCoverage;
      results: FindResult[];
    }> {
      const { signal, ...asked } = request;
      // Its asker gone (a newer keystroke) before the log is taken: no work.
      signal?.throwIfAborted();
      deps.settle();
      return views.withRequest(signal, (requestId) =>
        views.listing({ live: deps.live(), request: { ...asked, requestId } })
      );
    },
    /** What waits on the person's eyes (views/find-engine.ts `waiting`). */
    async waiting(): Promise<WaitingAnswer> {
      const from = await deps.waitingFrom();
      deps.settle();
      return views.waiting({ from, live: deps.live() });
    },
    /** The sessions these names name, each as find answers it, or null (views/find-engine.ts `named`). */
    named: (
      names: string[]
    ): Promise<Record<string, FindConversation | null>> => {
      deps.settle();
      return views.named({ names, live: deps.live() });
    },
    /** Reads one machine's catalog again (a listing under way is the one waited on). */
    relist: async (machineId: string): Promise<void> => {
      await views.relist(machineId);
    },
    /** The machine's stored transcripts moved, each as it reads now, and these left (core `CatalogMovedFrame`). */
    catalogMoved: async (
      machineId: string,
      moved: NeutralSessionInfo[],
      removed: string[]
    ): Promise<void> => {
      await views.catalogMoved({ machineId, moved, removed });
    },
    /** These sessions of a machine's catalog, as last read. */
    catalogSessions: (
      machineId: string,
      sessionIds: string[]
    ): Promise<NeutralSessionInfo[]> =>
      views.catalogSessions({ machineId, sessionIds }),
  };
};

export type Find = ReturnType<typeof createFind>;

/** `by=me` and its kin read into a moment's author; anything else is refused by the schema. */
const AUTHOR_OF: Record<FindBy, MomentAuthor> = {
  me: "owner",
  agent: "agent",
  report: "report",
};

/**
 * `GET /api/find`'s query: one page of a find. `transcripts=0` answers from
 * the names alone (what the hub holds, in milliseconds); otherwise every
 * machine's transcripts are asked too, and the answer's coverage says which
 * answered. The routes sit inline in the hub's chain (server.ts): a plugin
 * of their own took the chain's type past TypeScript's instantiation depth.
 */
export const FIND_QUERY = t.Object({
  q: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  kinds: t.Optional(t.String()),
  by: t.Optional(
    t.Union([t.Literal("me"), t.Literal("agent"), t.Literal("report")])
  ),
  transcripts: t.Optional(t.Union([t.Literal("0"), t.Literal("1")])),
  /** A machine to list the stored sessions of again first: Try again on its left-out line. */
  relist: t.Optional(t.String()),
});

/**
 * `POST /api/find/sessions`' body: the sessions a screen names by id and
 * holds no row of (a chip, a tab, a card), asked together; each answered as
 * find answers it, or null (views/find-engine.ts `named`).
 */
export const FIND_SESSIONS_BODY = t.Object({
  names: t.Array(t.String({ minLength: 1, maxLength: 200 }), {
    maxItems: 200,
  }),
});

/** `GET /api/find/places`' query: one conversation, by its instance id, and the words. */
export const FIND_PLACES_QUERY = t.Object({
  session: t.String({ minLength: 1 }),
  q: t.String(),
});

/** Whether `kind` is one find answers with. */
const isFindKind = (kind: string): kind is FindKind =>
  FIND_KINDS.some((one) => one === kind);

/** `kinds=conversation,task` read into kinds, or the refusal naming the unknown one. */
const kindsOf = (raw: string | undefined) => {
  if (!raw?.trim()) {
    return;
  }
  const kinds = raw
    .split(",")
    .map((each) => each.trim())
    .filter(Boolean);
  const known = kinds.filter(isFindKind);
  const unknown = kinds.filter((kind) => !isFindKind(kind));
  if (unknown.length > 0) {
    return problem(400, {
      code: "find-kind-unknown",
      detail: `${unknown.map((kind) => `"${kind}"`).join(", ")} is not a kind find answers with. Kinds: ${FIND_KINDS.join(", ")}.`,
    });
  }
  return known;
};

/** `GET /api/find`'s answer, or its refusal. */
export const answerFind = async (
  find: Find,
  query: {
    by?: FindBy;
    cursor?: string;
    kinds?: string;
    limit?: string;
    q?: string;
    relist?: string;
    transcripts?: "0" | "1";
  },
  /** Each moment carries the words around it, for the secret filter (find-secrets.ts). */
  context: boolean,
  /** Who asks, and the request's signal, which aborts once its asker goes (a newer keystroke). */
  ask: Pick<FindRequest, "caller" | "signal">
) => {
  const kinds = kindsOf(query.kinds);
  if (kinds instanceof ElysiaStatus) {
    return kinds;
  }
  const page = await find.find({
    q: query.q ?? "",
    ...ask,
    ...(context ? { context: true as const } : {}),
    ...(query.limit ? { limit: Number(query.limit) || DEFAULT_LIMIT } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.relist ? { relist: query.relist } : {}),
    ...(query.by ? { author: AUTHOR_OF[query.by] } : {}),
    kinds,
    transcripts: query.transcripts !== "0",
  });
  if (page instanceof ElysiaStatus) {
    return page;
  }
  const { total: _total, ...answer } = page;
  const answered: FindAnswer = answer;
  return answered;
};
