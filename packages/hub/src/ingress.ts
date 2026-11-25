/**
 * Ingress (Projects spec §5.5, P3): events from outside reach a project once.
 *
 * THE INVARIANT: every inbound event is stored once, under (source, delivery
 * key), however many paths bring it in. {@link Ingress.ingest} is the one
 * door: the GitHub poller, the connector poller and (slice 5) the relay's
 * webhook receiver all call it, and its insert is the dedup: a key already
 * there inserts nothing and nothing downstream runs. So "a GitHub webhook
 * and a poll of the same event land once" holds whichever comes first.
 *
 * - **GitHub** (github.ts): a project whose checkout's origin is on
 *   github.com, and that names a `github` connection that reads GitHub's
 *   API (core `readsGitHubApi`: a machine's gh, a code sign-in, a GitHub
 *   App or a token, held in the hub), has its repository polled every 60
 *   s: pulls, issues, issue comments and issue events, each with its ETag,
 *   and discussions with their comments through GraphQL, each resource's
 *   high-water mark kept on the repository's watch (`watch_cursors`), so a
 *   restart neither re-delivers nor misses. A GitHub connection's projects
 *   that follow none are followed through it from the moment it names them,
 *   by whichever way it signed in, and a repository linked later is watched
 *   through it too (db/watches.ts); dropping a project or removing the
 *   connection stops it ({@link Ingress.followConnection}). A repository
 *   a tracker binding syncs reads with the binding's connection.
 *   With no connection granted, its repository isn't polled, and its ingress
 *   view says so.
 * - **Connector polls**: any connection's read-only tool, called on an
 *   interval of 60 s or more; its items diffed by id and version against
 *   what the last call saw and stored as `conn:<connection>:<tool>`,
 *   `<id>:<version>`. A first call only looks.
 * - **Routing** (§5.9 Event routing): the matcher filters first, to the
 *   project's enabled routes whose every condition holds (source pattern,
 *   kinds, author, label, branch, a regex over title and body, both matched
 *   on RE2 in linear time). Jev on: Jev chooses among their routines, or
 *   none, which leaves it to the trigger router; a Jev that does not answer leaves the event
 *   stored and unrouted, and says so in the log. Jev off: the oldest
 *   matching route takes it. The routine runs with the event as the run's
 *   input (routines.ts `runForEvent`; behind a run still going it queues,
 *   and is handled when it starts). An event no route took is a trigger on
 *   what it is about (triggers.ts): the session on it, else a fresh one,
 *   never the project's Caw conversation; while the project's triggers are
 *   off it is held on the project, and the session that starts when they
 *   are switched on reads it with the rest.
 * - **Data, never instructions.** An event reaches a model only inside a
 *   delimited block ({@link eventData}) whose JSON cannot
 *   close it, after a sentence that says it is untrusted content.
 * - **External items** (external-items.ts): every event stored is applied
 *   to the task links it names (an issue's, pull request's or discussion's
 *   state, title, labels), and a comment on a linked discussion, or on a
 *   linked issue in a project no tracker is bound to, is filed on its task
 *   as data; each poll reads the GitHub links not read yet. The routine an
 *   event goes to still hears it and judges; it never files.
 * - **A merged pull request** an attempt opened moves its task on
 *   (dispatch.ts `pullRequestMerged`), once, since only the insert calls it.
 * - **Waits on GitHub** (task-waits.ts): each Actions run a task or plan
 *   step waits on is read by the project's own poll, with its poller's
 *   connection, until it settles (green); its state is what the resolver
 *   reads ({@link Ingress.githubWait}), and a change tells the project's
 *   tasks ({@link IngressDeps.waitsMoved}). A pull request waited on is a
 *   task link like any other, its state the link row's (external-items.ts
 *   `prWait`), kept by the events and reads above. A project with no GitHub
 *   poller is refused either wait where it is written.
 */
import { readsGitHubApi } from "@cawco/core/connections";
import { detach } from "@cawco/core/detach";
import {
  type OfferedMode,
  SESSION_CHOSEN_MODES,
} from "@cawco/core/harness/modes";
import type { InstanceRow } from "@cawco/core/protocol";
import { HOUR_MS, secondsOf } from "@cawco/core/time";
import { githubTarget, type WaitTarget } from "@cawco/core/wait-targets";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { configurePage } from "@cawco/core/words/configure";
import { cutShort } from "@cawco/core/words/helpers";
import { routineToolWords } from "@cawco/core/words/routines";
import { taskLinkWords } from "@cawco/core/words/task-links";
import AsyncLock from "async-lock";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { RE2JS } from "re2js";
import { z } from "zod";
import { readsOnly } from "./connection-writes";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type {
  ConnectorPollRow,
  Delivery,
  EventRouteRow,
  InboundEventRow,
} from "./db/ingress";
import type { InboundVia } from "./db/stored-types";
import type { GitHubWatch, Rehomed } from "./db/watches";
import type { Dispatcher } from "./dispatch";
import type { ExternalItems } from "./external-items";
import { githubReposOf, pollRepo, readRunWait } from "./github";
import { byHandle } from "./handles";
import { eventData, type InboundEvent } from "./inbound-event";
import type {
  ConnectorPollView,
  EventRouteView,
  InboundEventView,
  IngressView,
} from "./ingress-views";
import { PAYLOAD_MAX } from "./ingress-views";
import type { JevAccess } from "./jev";
import { JevFailed, jevRoute, offLine, TO_CONVERSATION } from "./jev-placement";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { defineTool } from "./mcp-tool";
import {
  deletedWords,
  ingressWords,
  pollListWords,
  pollWords,
  routeWords,
} from "./presenters/project";
import type { Routines } from "./routines";
import { normaliseTaskRef } from "./task-file";
import type { GitHubWaitState } from "./task-waits";
import { MODE } from "./tasks";
import type { TriggerEvent } from "./trigger-event";
import type { Routed } from "./triggers";

/** What the poller says of a project that links no GitHub repository. */
const NO_GITHUB_LINK =
  "Nothing is polled: the project links no repository on github.com.";

/** One repository's poll within a project's: its watch, what it read, and how many events were new. */
interface RepoPolled {
  landed: number;
  polled: Awaited<ReturnType<typeof pollRepo>>;
  repo: string;
  watch: GitHubWatch;
}

/** A repository's poll that never asked: its connection could not sign in, in words. */
const unsigned = (words: string): RepoPolled["polled"] => ({
  cursors: {},
  events: [],
  problem: words,
  resumeAt: null,
  unanswered: null,
});

/** A client signed in as a GitHub connection (connections.ts `githubClient`). */
type GitHubClient = ReturnType<Connections["githubClient"]>;

/** What a poll's repositories' problems come to, each named when there are several; null: none. */
const pollProblem = (
  polls: readonly { reason: string | null; repo: string }[]
): string | null => {
  const problems = polls.flatMap(({ repo, reason }) => {
    if (reason === null) {
      return [];
    }
    return [polls.length > 1 ? `${repo}: ${reason}` : reason];
  });
  return problems.length > 0 ? problems.join(" ") : null;
};

/** The project's watches of the github.com repositories it links, in its links' order. */
const linkedWatches = (
  links: readonly string[],
  followed: readonly GitHubWatch[]
): GitHubWatch[] => {
  const byRepo = new Map(
    followed.map((watch) => [watch.container.toLowerCase(), watch])
  );
  return [
    ...new Set(
      githubReposOf(links).flatMap(
        (repo) => byRepo.get(repo.toLowerCase()) ?? []
      )
    ),
  ];
};

/** The GitHub watches the poller reads, by project. */
const byProject = (
  followed: readonly GitHubWatch[]
): Map<string, GitHubWatch[]> => {
  const by = new Map<string, GitHubWatch[]>();
  for (const watch of followed) {
    by.set(watch.projectId, [...(by.get(watch.projectId) ?? []), watch]);
  }
  return by;
};

/** The latest of a project's watches' times, ms; 0 when none has one. */
const latest = (
  followed: readonly GitHubWatch[],
  key: "polledAt" | "resumeAt"
): number =>
  Math.max(0, ...followed.map((watch) => watch[key]?.getTime() ?? 0));

/** GitHub every 60 s (§5.5). */
const GITHUB_EVERY_MS = 60_000;
/** The shortest interval a connector poll takes. */
const CONNECTOR_MIN_S = 60;
/** How often the pollers look for one that is due. Our choice. */
const LOOK_MS = 5000;
const CUT = "[cut by the hub: the event was over 64 KB]";
/**
 * What a route's regex reads at most: what is stored of an event
 * ({@link PAYLOAD_MAX}). RE2 is linear, so reading all of it costs little.
 * And how long the regex may be.
 */
const MATCH_TEXT_MAX = PAYLOAD_MAX;
const REGEX_MAX = 200;
/** Events an ingress view lists a page of; `eventsMore` counts the older ones, which `skip` reaches. */
const EVENTS_SHOWN = 50;

const bytes = (text: string) => Buffer.byteLength(text, "utf8");
/** What a character cut in half decodes to, at the end of a cut. */
const TORN_CHARACTER = /�$/u;

/** `text` cut to at most `max` bytes, on a character boundary. */
const cutTo = (text: string, max: number): string => {
  const buffer = Buffer.from(text, "utf8");
  return buffer.length <= max
    ? text
    : buffer
        .subarray(0, Math.max(0, max))
        .toString("utf8")
        .replace(TORN_CHARACTER, "");
};

/**
 * The event as stored: JSON of at most {@link PAYLOAD_MAX} bytes. Over it,
 * the body is cut first, with a marker; a connector item over it is kept as
 * the head of its JSON, marked.
 */
const storedPayload = (event: InboundEvent): string => {
  const full = JSON.stringify(event);
  if (bytes(full) <= PAYLOAD_MAX) {
    return full;
  }
  const { data, body, ...rest } = event;
  const room = PAYLOAD_MAX - bytes(JSON.stringify(rest)) - 512;
  if (data === undefined && body !== null) {
    return JSON.stringify({ ...rest, body: `${cutTo(body, room)}\n${CUT}` });
  }
  return JSON.stringify({
    ...rest,
    body: body === null ? null : cutTo(body, Math.floor(room / 4)),
    cut: CUT,
    dataHead: cutTo(String(JSON.stringify(data)), Math.floor(room / 2)),
  });
};

/** Which kind of trigger a stored event is (trigger-event.ts `EVENT_SKILLS`). */
const kindOf = (row: InboundEventRow): "github-event" | "inbound-event" =>
  row.source.startsWith("github") ? "github-event" : "inbound-event";

/** A value at a dot path (`fields.version`); the whole value for an empty path. */
export const valueAt = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (into, part) =>
        into !== null && typeof into === "object"
          ? new Map<string, unknown>(Object.entries(into)).get(part)
          : undefined,
      value
    );

/** A scalar as a key part; anything else is no id. A part is bounded only by its item (PAYLOAD_MAX): its columns are unbounded text. */
const keyPart = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  return String(value);
};

/**
 * Route patterns run on RE2 (re2js, "the JavaScript port of RE2, a regular
 * expression engine that provides linear time matching",
 * npmjs.com/package/re2js): no pattern a session writes can make a match
 * backtrack, so none can hold the hub's loop. Compiled once each.
 */
const compiled = new Map<string, RE2JS>();
const re2 = (pattern: string, flags = 0): RE2JS => {
  const key = `${flags}\0${pattern}`;
  const known = compiled.get(key);
  if (known) {
    return known;
  }
  const made = RE2JS.compile(pattern, flags);
  compiled.set(key, made);
  return made;
};

/** `*` matching any run of characters; everything else literal; any case. */
const globMatches = (pattern: string, source: string): boolean =>
  re2(
    pattern.split("*").map(RE2JS.quote).join(".*"),
    RE2JS.CASE_INSENSITIVE
  ).testExact(source);

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * Why a route's regex cannot be one, or nothing. RE2 has no backreferences
 * or lookaround (they are what make a match backtrack): a pattern using
 * them is refused with RE2's own words.
 */
const regexProblem = (regex: string): string | undefined => {
  if (regex.length > REGEX_MAX) {
    return routineToolWords.regexOver(REGEX_MAX);
  }
  try {
    re2(regex);
    return undefined;
  } catch (error) {
    return `regex is not one RE2 runs (it has no backreferences or lookaround, which is what keeps every match linear in time): ${error instanceof Error ? error.message : String(error)}`;
  }
};

/** Whether every condition `route` sets holds for `event`, its kinds aside: the routes are read for the event's kind. */
const matches = (route: EventRouteRow, event: InboundEvent): boolean => {
  if (!globMatches(route.source, event.source)) {
    return false;
  }
  if (route.author !== null && !same(route.author, event.actor)) {
    return false;
  }
  if (
    route.label !== null &&
    !event.labels.some((label) => same(route.label, label))
  ) {
    return false;
  }
  if (route.branch !== null && route.branch !== event.branch) {
    return false;
  }
  if (route.regex === null) {
    return true;
  }
  const text = [
    event.title,
    event.body,
    event.data === undefined ? null : JSON.stringify(event.data),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .slice(0, MATCH_TEXT_MAX);
  return re2(route.regex).test(text);
};

/** Who acts: you (the dashboard), or a session through its tools. */
export type IngressActor = "owner" | InstanceRow;

/** A route's conditions as written. */
export interface RouteInput {
  author?: string | null;
  branch?: string | null;
  enabled?: boolean;
  kinds?: string[];
  label?: string | null;
  /** The mode its event starts the project's conversation in when it has none; null: its routine's. */
  mode?: OfferedMode | null;
  regex?: string | null;
  routineId: string;
  source: string;
}

/** A connector poll as written. */
export interface ConnectorPollInput {
  args?: Record<string, unknown>;
  connection: string;
  enabled?: boolean;
  idPath: string;
  intervalS: number;
  itemsPath?: string;
  tool: string;
  versionPath: string;
}

export interface IngressDeps {
  readonly connections: Pick<
    Connections,
    "callConnection" | "get" | "githubClient" | "listConnectionTools"
  >;
  readonly db: Pick<
    DbShape,
    "connections" | "ingress" | "project" | "routines"
  >;
  /** Moves a task on when the pull request its attempt opened merges (dispatch.ts). */
  readonly dispatcher: Pick<Dispatcher, "pullRequestMerged">;
  /** An event landed for a project, stored once: its starters are asked again (project-starters.ts). */
  readonly eventLanded: (projectId: string) => void;
  /** Applies a stored event to the task links it names, and reads links not read yet (external-items.ts). */
  readonly externalItems: Pick<ExternalItems, "applyEvent" | "readLinks">;
  /** Jev's route while Jev is on (jev.ts `jevAccess`). */
  readonly jevAccess: () => JevAccess | undefined;
  readonly lifetime: HubLifetimeShape;
  /** Runs a routine once with an event as its input (routines.ts). */
  readonly routines: Pick<Routines, "runForEvent">;
  /** A trigger on an event no route took, to the router (triggers.ts `route`). */
  readonly trigger: (projectId: string, event: TriggerEvent) => Promise<Routed>;
  /** A run a project waits on changed state: its tasks look again (tasks.ts `waitsMoved`). */
  readonly waitsMoved?: (projectId: string) => void;
}

/** How long a run nobody has asked about stays on the poll's list. Our choice. */
const WAIT_ASKED_MS = HOUR_MS;
/** The states a wait on a run keeps for good: the poll stops asking. */
const FINAL_WAITS: ReadonlySet<GitHubWaitState> = new Set(["green"]);

/** A wait on an Actions run, the one wait this poll reads itself. */
type RunTarget = Extract<WaitTarget, { kind: "run" }>;

/** Each route's last delivery by its id (`IngressDb.deliveries`). */
const deliveredBy = (deliveries: Delivery[]): Map<string, number> =>
  new Map(deliveries.map((each) => [each.routeId, each.receivedAt]));

const routeView = (
  row: EventRouteRow,
  delivered: Map<string, number>
): EventRouteView => ({
  lastDeliveryAt: delivered.get(row.id) ?? null,
  id: row.id,
  projectId: row.projectId,
  source: row.source,
  kinds: row.kinds,
  author: row.author,
  label: row.label,
  branch: row.branch,
  regex: row.regex,
  routineId: row.routineId,
  enabled: row.enabled,
  mode: row.mode,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
});

const pollView = (row: ConnectorPollRow): ConnectorPollView => ({
  id: row.id,
  projectId: row.projectId,
  connection: row.connection,
  tool: row.tool,
  args: row.args,
  intervalS: row.intervalS,
  itemsPath: row.itemsPath,
  idPath: row.idPath,
  versionPath: row.versionPath,
  enabled: row.enabled,
  seen: row.seen,
  reason: row.reason,
  polledAt: row.polledAt?.getTime() ?? null,
  createdBy: row.createdBy,
  createdAt: row.createdAt.getTime(),
});

const eventView = (row: InboundEventRow): InboundEventView => {
  const event: unknown = JSON.parse(row.payload);
  return {
    id: row.id,
    source: row.source,
    key: row.deliveryKey,
    kind: row.kind,
    via: row.via,
    event,
    receivedAt: row.receivedAt.getTime(),
    routedTo: row.routedTo,
    handledAt: row.handledAt?.getTime() ?? null,
  };
};

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const conditions = {
  source: z.string().describe("* globs: github:*, conn:<connection>:<tool>."),
  kinds: z
    .array(z.string())
    .optional()
    .describe(
      "pr.opened|merged|closed, issue.opened|closed|labeled, comment.created, discussion.created, discussion_comment.created, item."
    ),
  author: z.string().optional(),
  label: z.string().optional(),
  branch: z.string().optional().describe("PR head branch."),
  regex: z.string().optional().describe("Over title and body."),
};

const pollFields = {
  args: z.record(z.string(), z.unknown()).optional(),
  interval_s: z.number().int().min(CONNECTOR_MIN_S),
  items_path: z
    .string()
    .optional()
    .describe("Dot path to the list; default the answer."),
  id_path: z.string().describe("Dot path to an item's id."),
  version_path: z
    .string()
    .describe("Dot path to its version, like updated_at."),
};

const ref = () => z.string().trim().min(1).describe("Its id.");

export const createIngress = ({
  connections,
  db,
  dispatcher,
  eventLanded,
  externalItems,
  jevAccess,
  lifetime,
  routines,
  trigger,
  waitsMoved,
}: IngressDeps) => {
  const store = db.ingress;
  /**
   * Each run waited on, by URL: the project that asked, when it last asked,
   * and its state as the last poll read it.
   */
  const waits = new Map<
    string,
    {
      asked: number;
      projectId: string;
      state: GitHubWaitState;
      title: string | null;
    }
  >();
  /** Polls under way, by `github:<project>` or `conn:<poll id>`: one at a time each. */
  const running = new Map<string, Promise<void>>();
  let timer: HubTimer | undefined;

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    problem(404, {
      code: "ingress-project-unknown",
      detail: `The hub keeps no project ${projectId}.`,
    });

  /** The project `actor` may act in: its own, refused without one. */
  const scopeOf = (actor: IngressActor, projectId?: string | null) => {
    if (actor === "owner") {
      if (!projectId) {
        return problem(400, {
          code: "ingress-project-unnamed",
          detail: "Name the project.",
        });
      }
      const project = projectOf(projectId);
      return project instanceof ElysiaStatus ? project : project.id;
    }
    return (
      actor.projectId ??
      problem(403, {
        code: "ingress-no-project",
        detail: "This session is in no project, so it has no inbound events.",
      })
    );
  };

  /** Why `actor` may not touch a `what` of project `projectId`; nothing when it may. */
  const notYours = (actor: IngressActor, projectId: string, what: string) =>
    actor !== "owner" && actor.projectId !== projectId
      ? problem(403, {
          code: "ingress-not-yours",
          detail: `That ${what} is not one of this session's project's.`,
        })
      : undefined;

  // --- the one door ----------------------------------------------------------

  /** The routes whose every condition holds for `event`, oldest first: the matcher's filter. */
  const matching = (projectId: string, event: InboundEvent) =>
    store.routes(projectId, event.kind).filter((each) => {
      const routine = db.routines.get(each.routineId);
      if (!(each.enabled && routine?.enabled && routine.target)) {
        return false;
      }
      try {
        return matches(each, event);
      } catch (error) {
        console.warn(
          `[ingress] route ${each.id} did not run: ${wordsOf(error)}`
        );
        return false;
      }
    });

  /**
   * The routine an event goes to among the matching routes' (Event routing,
   * §5.9), or the project's conversation; undefined when Jev did not answer: the event stays
   * stored and unrouted.
   */
  const chosen = async (
    row: InboundEventRow,
    event: InboundEvent,
    routineIds: string[]
  ): Promise<string | undefined> => {
    const access = jevAccess();
    if (!access) {
      offLine(
        "routing",
        row.projectId,
        `${row.source} ${row.deliveryKey}: the matcher's oldest route, routine ${routineIds[0]}${routineIds.length > 1 ? ` (of ${routineIds.length} matching)` : ""}`
      );
      return routineIds[0];
    }
    try {
      return await jevRoute(
        access,
        row.projectId,
        event,
        routineIds.flatMap((id) => {
          const routine = db.routines.get(id);
          return routine
            ? [
                {
                  id,
                  name: routine.name,
                  prompt: routine.stop
                    ? `${routine.name}; it stops when ${routine.stop}`
                    : routine.name,
                },
              ]
            : [];
        })
      );
    } catch (error) {
      if (error instanceof JevFailed) {
        console.warn(
          `[ingress] ${row.source} ${row.deliveryKey} stays unrouted: ${error.message}`
        );
        return;
      }
      throw error;
    }
  };

  /** Where a stored event goes: a routine, the project's conversation, or nowhere. */
  const route = async (
    row: InboundEventRow,
    event: InboundEvent
  ): Promise<void> => {
    const routes = matching(row.projectId, event);
    const routineIds = [...new Set(routes.map((each) => each.routineId))];
    const to =
      routineIds.length > 0
        ? await chosen(row, event, routineIds)
        : TO_CONVERSATION;
    if (to === undefined) {
      return;
    }
    if (to !== TO_CONVERSATION) {
      // Routed first: a queued run is handled when it starts (routines.ts
      // `drain`). It was delivered by the oldest matching route to its routine.
      store.setEvent(row.id, {
        routedTo: to,
        routeId: routes.find((each) => each.routineId === to)?.id ?? null,
      });
      const run = routines.runForEvent(to, row.id);
      if (run?.state !== "queued") {
        store.setEvent(row.id, { handledAt: new Date() });
      }
      console.log(
        `[ingress] ${row.source} ${row.deliveryKey} → routine ${to}${run ? ` (run ${run.id}, ${run.state}${run.reason ? `: ${run.reason}` : ""})` : ""}`
      );
      return;
    }
    store.setEvent(row.id, { routedTo: TO_CONVERSATION });
    await toConversation(row, event.url);
  };

  /**
   * An event no route took, a trigger on what it is about (triggers.ts):
   * its pull request's, issue's or item's url, else the event itself, so a
   * run of events on one pull request reaches one session. Handled once a
   * session took it or the project holds it (its triggers off).
   */
  const toConversation = async (
    row: InboundEventRow,
    url: string | null | undefined
  ): Promise<void> => {
    const routed = await trigger(row.projectId, {
      kind: kindOf(row),
      thing: {
        kind: "event",
        id: url ?? row.id,
        name: url ?? `${row.source} ${row.deliveryKey}`,
      },
      what: `${row.source} sent ${row.kind}${url ? ` (${url})` : ""}, and no route took it.`,
      delta: eventData(row),
      who: row.source,
      at: row.receivedAt,
    });
    if (routed.to !== "lost") {
      store.setEvent(row.id, { handledAt: new Date() });
      return;
    }
    console.warn(
      `[ingress] ${row.source} ${row.deliveryKey} reached no session: ${routed.why}`
    );
  };

  /**
   * THE door every path calls: the event stored once under (source, key),
   * then routed, and a merged pull request handed to the dispatcher. A
   * repeat stores nothing and runs nothing; answers the row it stored.
   */
  const ingest = (
    event: InboundEvent,
    via: InboundVia,
    projectId: string
  ): InboundEventRow | undefined => {
    const row = store.insertEvent({
      id: crypto.randomUUID(),
      source: event.source,
      deliveryKey: event.key,
      kind: event.kind,
      projectId,
      payload: storedPayload(event),
      receivedAt: new Date(),
      via,
      routedTo: null,
      routeId: null,
      handledAt: null,
    });
    if (!row) {
      return undefined;
    }
    console.log(`[ingress] ${row.source} ${row.deliveryKey} landed via ${via}`);
    eventLanded(projectId);
    detach(
      route(row, event).catch((error: unknown) =>
        console.warn(
          `[ingress] ${row.source} ${row.deliveryKey} was not routed: ${wordsOf(error)}`
        )
      ),
      "route an inbound event"
    );
    const unlinked = (why: string) =>
      console.warn(
        `[ingress] ${row.source} ${row.deliveryKey} did not reach its task links: ${why}`
      );
    detach(
      externalItems.applyEvent(projectId, event).then(
        (refused) => refused && unlinked(refused.response.detail),
        (error: unknown) => unlinked(wordsOf(error))
      ),
      "apply an inbound event to task links"
    );
    const { url } = event;
    if (event.kind === "pr.merged" && url) {
      detach(
        dispatcher.pullRequestMerged(url).then((moved) => {
          if (moved instanceof ElysiaStatus) {
            console.warn(
              `[pull request ${url} merged] failed: ${moved.response.detail}`
            );
            return;
          }
          if (moved) {
            console.log(
              `[ingress] ${url} merged: ${moved.task} is in ${moved.stage}`
            );
          }
        }),
        `pull request ${url} merged`
      );
    }
    return row;
  };

  // --- GitHub -------------------------------------------------------------------

  /**
   * One poll of every GitHub repository the project links and watches:
   * each one read through its watch's connection, its events ingested, then
   * every watch's outcome and cursors kept. A repository it no longer links
   * keeps its watch and cursors, unread.
   */
  const pollGitHub = async (projectId: string): Promise<void> => {
    const followed = store.githubWatches(projectId);
    const project = db.project(projectId);
    if (!(followed.length > 0 && project)) {
      return;
    }
    const linked = linkedWatches(project.links, followed);
    const now = Date.now();
    if (linked.length === 0) {
      store.keepGitHubPoll(
        followed.map((watch) => ({
          id: watch.id,
          patch: { reason: NO_GITHUB_LINK, polledAt: new Date(now) },
        }))
      );
      return;
    }
    const clients = new Map<string, GitHubClient | string>();
    const clientOf = (connection: string): GitHubClient | string => {
      const known = clients.get(connection);
      if (known !== undefined) {
        return known;
      }
      let made: GitHubClient | string;
      try {
        made = connections.githubClient(connection);
      } catch (error) {
        made = wordsOf(error);
      }
      clients.set(connection, made);
      return made;
    };
    const polls: RepoPolled[] = [];
    for (const watch of linked) {
      const octokit = clientOf(watch.reads);
      const repo = watch.container;
      if (typeof octokit === "string") {
        polls.push({ watch, repo, polled: unsigned(octokit), landed: 0 });
        continue;
      }
      const polled = await pollRepo({
        connection: watch.reads,
        cursors: watch.cursors,
        now,
        octokit,
        repo,
      });
      const source = `github:${repo.toLowerCase()}`;
      const landed = polled.events
        .filter((event) => event.source === source)
        .sort((a, b) => a.at - b.at)
        .map((event) => ingest(event, "poll", projectId))
        .filter(Boolean).length;
      polls.push({ watch, repo, polled, landed });
    }
    const followedBy = store.followedBy(projectId);
    const octokit = followedBy ? clientOf(followedBy) : undefined;
    if (octokit !== undefined && typeof octokit !== "string") {
      await readWaits(projectId, octokit);
      await externalItems.readLinks(projectId, octokit);
    }
    keepGitHubPoll(now, followed, polls);
  };

  /**
   * The runs project `projectId` waits on, read with its poller's client,
   * each until it settles; one nobody asked about for an hour leaves the
   * list, settled or not (a reader asks again on its next read, and it comes
   * back). A state that moved tells the project's tasks.
   */
  const readWaits = async (
    projectId: string,
    octokit: ReturnType<Connections["githubClient"]>
  ): Promise<void> => {
    let moved = false;
    for (const [url, target] of waitsDue(projectId)) {
      const read = await readRunWait(octokit, target).catch(() => undefined);
      const wait = waits.get(url);
      if (
        wait &&
        read &&
        (read.state !== wait.state || read.title !== wait.title)
      ) {
        waits.set(url, { ...wait, ...read });
        moved = true;
      }
    }
    if (moved) {
      waitsMoved?.(projectId);
    }
  };

  /** The waits project `projectId`'s poll reads now, the ones nobody asked about for an hour taken off the list. */
  const waitsDue = (projectId: string): [string, RunTarget][] => {
    const now = Date.now();
    const due: [string, RunTarget][] = [];
    for (const [url, wait] of waits) {
      const target = githubTarget(url);
      if (wait.projectId !== projectId || target?.kind !== "run") {
        continue;
      }
      if (now - wait.asked > WAIT_ASKED_MS) {
        waits.delete(url);
      } else if (!FINAL_WAITS.has(wait.state)) {
        due.push([url, target]);
      }
    }
    return due;
  };

  /**
   * The cursors each repository's poll moved, each over its own, and its
   * problem on its watch. The wait is the project's: the latest any rate
   * limit asks, on every watch it polled. A request GitHub did not answer
   * in time leaves every watch's problem and wait as they were, and says so
   * here. Every watch of the project is dated, so the project is due again
   * together.
   */
  const keepGitHubPoll = (
    now: number,
    followed: readonly GitHubWatch[],
    polls: readonly RepoPolled[]
  ): void => {
    const unanswered = polls.flatMap(({ repo, polled }) =>
      polled.unanswered === null ? [] : [{ repo, after: polled.unanswered }]
    );
    for (const { repo, after } of unanswered) {
      console.log(
        `[ingress] polled ${repo}: GitHub did not answer within ${secondsOf(after)} s; the poller's state stands`
      );
    }
    const resumeAt = Math.max(
      0,
      ...polls.map(({ polled }) => polled.resumeAt ?? 0)
    );
    const polledAt = new Date(now);
    const byWatch = new Map(polls.map((poll) => [poll.watch.id, poll]));
    store.keepGitHubPoll(
      followed.map((watch) => {
        const poll = byWatch.get(watch.id);
        if (!poll) {
          return { id: watch.id, patch: { polledAt } };
        }
        return {
          id: watch.id,
          cursors: poll.polled.cursors,
          patch:
            unanswered.length === 0
              ? {
                  polledAt,
                  reason: poll.polled.problem,
                  resumeAt: resumeAt === 0 ? null : new Date(resumeAt),
                }
              : { polledAt },
        };
      })
    );
    for (const { repo, polled, landed, watch } of polls) {
      if (
        landed > 0 ||
        (unanswered.length === 0 &&
          polled.problem !== watch.reason &&
          polled.problem)
      ) {
        console.log(
          `[ingress] polled ${repo}: ${landed} new${polled.problem ? `; ${polled.problem}` : ""}`
        );
      }
    }
  };

  // --- connector polls -------------------------------------------------------------

  /** The poll's items in a tool's answer: its structured content, else its first text as JSON. */
  const itemsIn = (
    poll: ConnectorPollRow,
    result: Awaited<ReturnType<Connections["callConnection"]>>
  ): unknown[] => {
    if (result.isError) {
      throw new Error("the tool answered an error");
    }
    let answer: unknown = result.structuredContent;
    if (answer === undefined) {
      const text = result.content.find((part) => part.type === "text");
      if (text?.type !== "text") {
        throw new Error("its answer had no text or structured content");
      }
      try {
        answer = JSON.parse(text.text);
      } catch (error) {
        throw new Error("its answer's text is not JSON", { cause: error });
      }
    }
    const items = valueAt(answer, poll.itemsPath);
    if (!Array.isArray(items)) {
      throw new Error(
        `no list of items at “${poll.itemsPath || "(the whole answer)"}”`
      );
    }
    return items;
  };

  /**
   * What a call saw, id to version, and the items that are new or changed
   * since the call before (`before`); none on a first call, which only looks.
   */
  const diffed = (
    poll: ConnectorPollRow,
    items: unknown[],
    before: ReadonlyMap<string, string> | null
  ) => {
    const seen = new Map<string, string>();
    const changed: { item: unknown; key: string }[] = [];
    for (const item of items) {
      const itemId = keyPart(valueAt(item, poll.idPath));
      const version = keyPart(valueAt(item, poll.versionPath));
      if (itemId === undefined || version === undefined) {
        continue;
      }
      seen.set(itemId, version);
      if (before !== null && before.get(itemId) !== version) {
        changed.push({ item, key: `${itemId}:${version}` });
      }
    }
    return { seen, changed };
  };

  /**
   * The poll as it stands now when it still lists and keys what `poll` did:
   * undefined when it was deleted, disabled, or edited in what it calls or
   * keys by while a call was out.
   */
  const unmoved = (poll: ConnectorPollRow): ConnectorPollRow | undefined => {
    const now = store.connectorPoll(poll.id);
    const shape = (row: ConnectorPollRow) =>
      JSON.stringify([
        row.args,
        row.itemsPath,
        row.idPath,
        row.versionPath,
        row.enabled,
      ]);
    return now && shape(now) === shape(poll) ? now : undefined;
  };

  /**
   * One call of a connector poll: new and changed items ingested, what it saw
   * kept. An edit made while the call was out wins: the call's answer is
   * dropped and nothing is written, so the next call starts from the edit.
   */
  const pollConnector = async (id: string): Promise<void> => {
    const asked = store.connectorPoll(id);
    if (!asked) {
      return;
    }
    const polledAt = new Date();
    let result: Awaited<ReturnType<typeof connections.callConnection>>;
    try {
      result = await connections.callConnection(
        asked.connection,
        asked.tool,
        asked.args
      );
    } catch (error) {
      failed(asked, polledAt, error);
      return;
    }
    // Same synchronous step from here to the write: no edit can land between.
    const poll = unmoved(asked);
    if (!poll) {
      console.log(
        `[ingress] connector poll ${id}: edited during its call, answer dropped`
      );
      return;
    }
    try {
      const { seen, changed } = diffed(
        poll,
        itemsIn(poll, result),
        poll.seenAt === null ? null : store.connectorPollItems(id)
      );
      const source = `conn:${poll.connection}:${poll.tool}`;
      const landed = changed.filter(({ item, key }) =>
        ingest(
          {
            source,
            key,
            kind: "item",
            actor: null,
            labels: [],
            branch: null,
            url: null,
            title: null,
            body: null,
            at: polledAt.getTime(),
            data: item,
          },
          "connector",
          poll.projectId
        )
      ).length;
      store.keepConnectorPollItems(id, seen, polledAt);
      if (landed > 0) {
        console.log(`[ingress] ${source}: ${landed} new or changed`);
      }
    } catch (error) {
      failed(poll, polledAt, error);
    }
  };

  /** A call that failed keeps its reason, unless the poll moved under it. */
  const failed = (
    asked: ConnectorPollRow,
    polledAt: Date,
    error: unknown
  ): void => {
    const poll = unmoved(asked);
    if (!poll) {
      return;
    }
    const reason = cutShort(
      `${poll.connection}/${poll.tool}: ${wordsOf(error)}`,
      500
    );
    store.updateConnectorPoll(poll.id, { reason, polledAt });
    if (reason !== poll.reason) {
      console.warn(`[ingress] connector poll ${poll.id}: ${reason}`);
    }
  };

  // --- the pollers' clock ------------------------------------------------------------

  /** Runs one poll at a time per key; a failure is logged, never lost. */
  const once = (key: string, poll: () => Promise<void>): Promise<void> => {
    const live = running.get(key);
    if (live !== undefined) {
      return live;
    }
    const going = poll()
      .catch((error: unknown) =>
        console.warn(`[ingress] ${key} poll failed: ${wordsOf(error)}`)
      )
      .finally(() => running.delete(key));
    running.set(key, going);
    return going;
  };

  /** Every poller that is due starts. */
  const look = (now: number = Date.now()): void => {
    for (const [projectId, followed] of byProject(store.githubWatches())) {
      const due =
        latest(followed, "polledAt") + GITHUB_EVERY_MS <= now &&
        latest(followed, "resumeAt") <= now;
      if (due) {
        detach(
          once(`github:${projectId}`, () => pollGitHub(projectId)),
          "github poll"
        );
      }
    }
    for (const poll of store.connectorPolls()) {
      if (
        poll.enabled &&
        (poll.polledAt?.getTime() ?? 0) + poll.intervalS * 1000 <= now
      ) {
        detach(
          once(`conn:${poll.id}`, () => pollConnector(poll.id)),
          "connector poll"
        );
      }
    }
  };

  const tickAgain = (): void => {
    if (lifetime.closed()) {
      return;
    }
    timer = lifetime.after("ingress look", LOOK_MS, () => {
      try {
        look();
      } catch (error) {
        console.error(`[ingress] a look failed: ${wordsOf(error)}`);
      }
      tickAgain();
    });
  };

  /** Hub start: the pollers pick up from their kept cursors. */
  const start = (): void => {
    lifetime.cancel(timer);
    look();
    tickAgain();
  };

  // --- the GitHub poller's setting and the view ---------------------------------------

  const githubOf = (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const repos = githubReposOf(project.links);
    const followed = store.githubWatches(projectId);
    const linked = linkedWatches(project.links, followed);
    const reading = [...new Set(linked.map((watch) => watch.reads))];
    const connection =
      reading.length > 0
        ? reading.join(", ")
        : (store.followedBy(projectId) ?? null);
    const named = repos.join(", ");
    const reason = pollProblem(
      linked.map((watch) => ({ repo: watch.container, reason: watch.reason }))
    );
    let state: string;
    if (repos.length === 0) {
      state = NO_GITHUB_LINK;
    } else if (linked.length === 0) {
      state = `${named} ${repos.length > 1 ? "aren't" : "isn't"} polled: grant the project a GitHub connection in ${configurePage("connections")}.`;
    } else if (reason) {
      state = `Polling ${named} with ${connection}; its last poll stopped: ${reason}`;
    } else {
      state = `Polling ${named} every 60 s with ${connection}.`;
    }
    const polledAt = latest(followed, "polledAt");
    const resumeAt = latest(followed, "resumeAt");
    const github: IngressView["github"] = {
      repos,
      repo: repos.length > 0 ? named : null,
      connection,
      polled: linked.length > 0,
      state,
      resources: {},
      polledAt: polledAt === 0 ? null : polledAt,
      resumeAt: resumeAt === 0 ? null : resumeAt,
    };
    return github;
  };

  const view = (projectId: string, skip = 0) => {
    const github = githubOf(projectId);
    if (github instanceof ElysiaStatus) {
      return github;
    }
    const delivered = deliveredBy(store.deliveries(projectId));
    const events = store.events(projectId, EVENTS_SHOWN, skip);
    const seen: IngressView = {
      github,
      routes: store.routes(projectId).map((row) => routeView(row, delivered)),
      connectorPolls: store.connectorPolls(projectId).map(pollView),
      events: events.map(eventView),
      eventsNext: skip + events.length,
      eventsMore: Math.max(
        store.eventCount(projectId) - skip - events.length,
        0
      ),
    };
    return seen;
  };

  /** What moving watches off a connection did, one log line each. */
  const sayRehomed = (gone: string, moved: readonly Rehomed[]): void => {
    for (const { projectId, container, to } of moved) {
      console.log(
        `[ingress] project ${projectId}: ${container} ${to ? `polled with ${to}` : "no longer polled"}, in place of ${gone}`
      );
    }
  };

  /**
   * A connection's projects were written (connections.ts `writeProjects`):
   * while it reads GitHub's API, each project it names that follows GitHub
   * with no connection follows it through this one from now, a watch of
   * each github.com repository it links (db/watches.ts `followGitHub`); a
   * project following another keeps that one. Each project it dropped, or
   * every one once it no longer reads GitHub's API, has its watches that
   * read through it moved to the connection the project follows by from
   * now, and stops following only where none is left (db/watches.ts
   * `rehome`).
   */
  const followConnection = (
    connection: string,
    dropped: readonly string[]
  ): void => {
    const found = connections.get(connection);
    const reads =
      found.service.trim().toLowerCase() === "github" &&
      readsGitHubApi(found.auth);
    if (!reads || dropped.length > 0) {
      sayRehomed(
        connection,
        store.rehome(connection, reads ? dropped : undefined, false)
      );
    }
    if (!reads) {
      return;
    }
    for (const projectId of found.projects) {
      if (store.followedBy(projectId) === undefined) {
        const repos = store.followGitHub(projectId, connection);
        console.log(
          repos.length > 0
            ? `[ingress] project ${projectId}: polls ${repos.join(", ")} with ${connection}`
            : `[ingress] project ${projectId}: links no repository on github.com; one it links is polled with ${connection}`
        );
      }
    }
  };

  /**
   * A connection is being removed (connections.ts `remove`): each GitHub
   * watch read through it moves to the connection its project follows by
   * from now; one with none is left for the trash to take with the
   * connection, and comes back with its Undo.
   */
  const connectionGoing = (connection: string): void => {
    sayRehomed(connection, store.rehome(connection, undefined, true));
  };

  /** Polls a project's repositories now, unless GitHub's rate limit holds it. */
  const pollGitHubNow = async (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const followed = store.githubWatches(projectId);
    if (followed.length === 0) {
      return problem(409, {
        code: "ingress-github-unpolled",
        detail: `This project has no GitHub connection, so its repository isn't polled. Grant it one in ${configurePage("connections")}.`,
      });
    }
    const resumeAt = latest(followed, "resumeAt");
    if (resumeAt > Date.now()) {
      return problem(409, {
        code: "ingress-github-rate-limited",
        detail: `GitHub's rate limit holds polls until ${new Date(resumeAt).toISOString()}.`,
      });
    }
    await once(`github:${projectId}`, () => pollGitHub(projectId));
    return view(projectId);
  };

  // --- routes --------------------------------------------------------------------

  /** Refuses a route that cannot run as written. */
  const checkedRoute = (projectId: string, input: RouteInput) => {
    const routine = db.routines.get(input.routineId);
    if (!routine?.target || routine.projectId !== projectId) {
      return problem(404, {
        code: "ingress-routine-unknown",
        detail: `The project has no routine ${input.routineId}: name a task that starts on its own (task_create with on or target makes one).`,
      });
    }
    if (!input.source.trim()) {
      return problem(400, {
        code: "ingress-source-unfit",
        detail:
          "source is a source or a pattern, like github:* or conn:linear:*.",
      });
    }
    const misfit = input.regex ? regexProblem(input.regex) : undefined;
    return misfit
      ? problem(400, { code: "ingress-regex-unfit", detail: misfit })
      : undefined;
  };

  /** The event route `id` as `by` may touch it. */
  const routeFor = (id: string, by: IngressActor) => {
    const row = store.route(id);
    if (!row) {
      return problem(404, {
        code: "ingress-route-unknown",
        detail: `There is no event route ${id}.`,
      });
    }
    return notYours(by, row.projectId, "route") ?? row;
  };

  const createRoute = (
    input: RouteInput & { projectId?: string | null },
    by: IngressActor
  ) => {
    const projectId = scopeOf(by, input.projectId);
    if (projectId instanceof ElysiaStatus) {
      return projectId;
    }
    const unfit = checkedRoute(projectId, input);
    if (unfit) {
      return unfit;
    }
    const row = store.createRoute({
      id: crypto.randomUUID(),
      projectId,
      source: input.source.trim(),
      kinds: input.kinds ?? [],
      author: input.author?.trim() || null,
      label: input.label?.trim() || null,
      branch: input.branch?.trim() || null,
      regex: input.regex || null,
      routineId: input.routineId,
      enabled: input.enabled ?? true,
      mode: input.mode ?? null,
      createdBy: by === "owner" ? "owner" : by.id,
      createdAt: new Date(),
    });
    console.log(
      `[ingress] route ${row.id} (${row.source}) → routine ${row.routineId}, by ${row.createdBy}`
    );
    const made: EventRouteView = routeView(
      row,
      deliveredBy(store.deliveries(row.projectId))
    );
    return made;
  };

  /** A route's fields with `patch` laid over them. */
  const patched = (row: EventRouteRow, patch: Partial<RouteInput>) => ({
    source: patch.source ?? row.source,
    kinds: patch.kinds ?? row.kinds,
    author:
      patch.author === undefined ? row.author : patch.author?.trim() || null,
    label: patch.label === undefined ? row.label : patch.label?.trim() || null,
    branch:
      patch.branch === undefined ? row.branch : patch.branch?.trim() || null,
    regex: patch.regex === undefined ? row.regex : patch.regex || null,
    routineId: patch.routineId ?? row.routineId,
    enabled: patch.enabled ?? row.enabled,
    mode: patch.mode === undefined ? row.mode : patch.mode,
  });

  const updateRoute = (
    id: string,
    patch: Partial<RouteInput>,
    by: IngressActor
  ) => {
    const row = routeFor(id, by);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    const next = patched(row, patch);
    const unfit = checkedRoute(row.projectId, next);
    if (unfit) {
      return unfit;
    }
    const updated: EventRouteView = routeView(
      store.updateRoute(id, next) ?? row,
      deliveredBy(store.deliveries(row.projectId))
    );
    return updated;
  };

  const deleteRoute = (id: string, by: IngressActor) => {
    const row = routeFor(id, by);
    return row instanceof ElysiaStatus
      ? row
      : { deleted: store.deleteRoute(id) };
  };

  // --- connector polls ----------------------------------------------------------------

  /**
   * Refuses a connector poll that cannot run as written: a connection the
   * project (for a session) grants, a tool its server marks read-only (a
   * poll calls it every interval, so it may never act), an interval of a
   * minute or more, and the paths that find each item's id and version.
   */
  const checkedPoll = async (
    projectId: string,
    input: ConnectorPollInput,
    by: IngressActor
  ) => {
    if (
      by !== "owner" &&
      !db.connections.namesForProject(projectId).includes(input.connection)
    ) {
      return problem(403, {
        code: "ingress-connection-ungranted",
        detail: `The project does not grant the connection ${input.connection}; the owner adds it to the project first.`,
      });
    }
    if (
      !Number.isInteger(input.intervalS) ||
      input.intervalS < CONNECTOR_MIN_S
    ) {
      return problem(400, {
        code: "ingress-interval-unfit",
        detail: `interval_s is a whole number of seconds, ${CONNECTOR_MIN_S} or more.`,
      });
    }
    if (!(input.idPath.trim() && input.versionPath.trim())) {
      return problem(400, {
        code: "ingress-paths-unfit",
        detail:
          "id_path and version_path name where each item keeps its id and its version, like id and updated_at.",
      });
    }
    let tools: Awaited<ReturnType<Connections["listConnectionTools"]>>;
    try {
      tools = await connections.listConnectionTools(input.connection);
    } catch (error) {
      return problem(409, {
        code: "ingress-connection-unlisted",
        detail: wordsOf(error),
      });
    }
    const found = tools.find((each) => each.name === input.tool);
    if (!found) {
      return problem(404, {
        code: "ingress-tool-unknown",
        detail: `${input.connection} has no tool ${input.tool}.`,
      });
    }
    if (!readsOnly(found)) {
      return problem(400, {
        code: "ingress-tool-not-read-only",
        detail: `${input.connection}/${input.tool} is not marked read-only, and a poll calls it every interval: poll a read tool.`,
      });
    }
  };

  const pollOf = (id: string) =>
    store.connectorPoll(id) ??
    problem(404, {
      code: "ingress-poll-unknown",
      detail: `There is no connector poll ${id}.`,
    });

  /** The connector poll `id` as `by` may touch it. */
  const pollFor = (id: string, by: IngressActor) => {
    const row = pollOf(id);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    return notYours(by, row.projectId, "connector poll") ?? row;
  };

  const createPoll = async (
    input: ConnectorPollInput & { projectId?: string | null },
    by: IngressActor
  ) => {
    const projectId = scopeOf(by, input.projectId);
    if (projectId instanceof ElysiaStatus) {
      return projectId;
    }
    const unfit = await checkedPoll(projectId, input, by);
    if (unfit) {
      return unfit;
    }
    const row = store.createConnectorPoll({
      id: crypto.randomUUID(),
      projectId,
      connection: input.connection,
      tool: input.tool,
      args: input.args ?? {},
      intervalS: input.intervalS,
      itemsPath: input.itemsPath?.trim() ?? "",
      idPath: input.idPath.trim(),
      versionPath: input.versionPath.trim(),
      enabled: input.enabled ?? true,
      seenAt: null,
      reason: null,
      polledAt: null,
      createdBy: by === "owner" ? "owner" : by.id,
      createdAt: new Date(),
    });
    console.log(
      `[ingress] connector poll ${row.id}: ${row.connection}/${row.tool} every ${row.intervalS} s, by ${row.createdBy}`
    );
    const made: ConnectorPollView = pollView(row);
    return made;
  };

  /** Edits of one poll under way, by its id: one at a time each. */
  const editing = new AsyncLock({ maxPending: Number.POSITIVE_INFINITY });

  /**
   * An edit of a poll, made from the row as the edit before it left it: its
   * check awaits the connection's tools, and an edit that read the row
   * before another's write would put that one's fields back.
   */
  const updatePoll = (
    id: string,
    patch: Partial<Omit<ConnectorPollInput, "connection" | "tool">>,
    by: IngressActor
  ) => editing.acquire(id, () => editPoll(id, patch, by));

  const editPoll = async (
    id: string,
    patch: Partial<Omit<ConnectorPollInput, "connection" | "tool">>,
    by: IngressActor
  ) => {
    const row = pollFor(id, by);
    if (row instanceof ElysiaStatus) {
      return row;
    }
    const next = {
      connection: row.connection,
      tool: row.tool,
      args: patch.args ?? row.args,
      intervalS: patch.intervalS ?? row.intervalS,
      itemsPath: patch.itemsPath?.trim() ?? row.itemsPath,
      idPath: patch.idPath?.trim() ?? row.idPath,
      versionPath: patch.versionPath?.trim() ?? row.versionPath,
      enabled: patch.enabled ?? row.enabled,
    };
    const unfit = await checkedPoll(row.projectId, next, by);
    if (unfit) {
      return unfit;
    }
    // What it lists or keys by moved: its next call only looks again.
    const relook = !Bun.deepEquals(
      [next.args, next.itemsPath, next.idPath, next.versionPath],
      [row.args, row.itemsPath, row.idPath, row.versionPath]
    );
    const edited: ConnectorPollView = pollView(
      store.updateConnectorPoll(id, {
        ...next,
        ...(relook ? { seenAt: null } : {}),
      }) ?? row
    );
    return edited;
  };

  const deletePoll = (id: string, by: IngressActor) => {
    const row = pollFor(id, by);
    return row instanceof ElysiaStatus
      ? row
      : { deleted: store.deleteConnectorPoll(id) };
  };

  /** Calls a connector poll now. */
  const pollConnectorNow = async (id: string) => {
    const known = pollOf(id);
    if (known instanceof ElysiaStatus) {
      return known;
    }
    await once(`conn:${id}`, () => pollConnector(id));
    const after = pollOf(id);
    return after instanceof ElysiaStatus ? after : pollView(after);
  };

  // --- tools -------------------------------------------------------------------------

  /** The ingress tools, bound to the calling session; with none, the same definitions for discovery. */
  const tools = (actor: InstanceRow | undefined) => {
    const me = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    /** The id of the caller's project's route `asked` names: its id or handle (handles.ts). */
    const routeNamed = (asked: string) => {
      const projectId = scopeOf(me());
      return projectId instanceof ElysiaStatus
        ? projectId
        : byHandle(
            asked,
            store.routes(projectId),
            {
              id: (one) => one.id,
              said: (one) => `${one.source} ${one.id.slice(0, 8)}`,
            },
            "event route"
          ).id;
    };
    /** The id of the caller's project's connector poll `asked` names. */
    const pollNamed = (asked: string) => {
      const projectId = scopeOf(me());
      return projectId instanceof ElysiaStatus
        ? projectId
        : byHandle(
            asked,
            store.connectorPolls(projectId),
            {
              id: (poll) => poll.id,
              said: (poll) =>
                `${poll.connection}:${poll.tool} ${poll.id.slice(0, 8)}`,
            },
            "connector poll"
          ).id;
    };
    /** The routine a route sends events to, named by its task (`tsk-12`); as written when it names none, which the route's check refuses. */
    const routineOfTask = (task: string): string => {
      const caller = me();
      const projectId = caller instanceof ElysiaStatus ? null : scopeOf(caller);
      const taskId = normaliseTaskRef(task) ?? task.trim();
      return typeof projectId === "string"
        ? (db.routines.byTask(projectId, taskId)?.id ?? taskId)
        : taskId;
    };
    return [
      EVENT_ROUTE_CREATE_DEFINITION.run(({ task, ...rest }) =>
        Promise.resolve(
          createRoute({ ...rest, routineId: routineOfTask(task) }, me())
        )
      ),
      EVENT_ROUTE_LIST_DEFINITION.run(({ skip }) => {
        const projectId = scopeOf(me());
        return Promise.resolve(
          projectId instanceof ElysiaStatus ? projectId : view(projectId, skip)
        );
      }),
      EVENT_ROUTE_UPDATE_DEFINITION.run(({ id, task, ...rest }) => {
        const named = routeNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus
            ? named
            : updateRoute(
                named,
                withoutUndefined({
                  ...rest,
                  routineId:
                    task === undefined ? undefined : routineOfTask(task),
                }),
                me()
              )
        );
      }),
      EVENT_ROUTE_DELETE_DEFINITION.run(({ id }) => {
        const named = routeNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus ? named : deleteRoute(named, me())
        );
      }),
      CONNECTOR_POLL_CREATE_DEFINITION.run(
        async (input) =>
          await createPoll(
            {
              connection: input.connection,
              tool: input.tool,
              intervalS: input.interval_s,
              idPath: input.id_path,
              versionPath: input.version_path,
              ...(input.args ? { args: input.args } : {}),
              ...(input.items_path === undefined
                ? {}
                : { itemsPath: input.items_path }),
            },
            me()
          )
      ),
      CONNECTOR_POLL_LIST_DEFINITION.run(() => {
        const projectId = scopeOf(me());
        return Promise.resolve(
          projectId instanceof ElysiaStatus
            ? projectId
            : store.connectorPolls(projectId).map(pollView)
        );
      }),
      CONNECTOR_POLL_UPDATE_DEFINITION.run(async (input) => {
        const named = pollNamed(input.id);
        return named instanceof ElysiaStatus
          ? named
          : await updatePoll(
              named,
              withoutUndefined({
                args: input.args,
                intervalS: input.interval_s,
                itemsPath: input.items_path,
                idPath: input.id_path,
                versionPath: input.version_path,
                enabled: input.enabled,
              }),
              me()
            );
      }),
      CONNECTOR_POLL_DELETE_DEFINITION.run(({ id }) => {
        const named = pollNamed(id);
        return Promise.resolve(
          named instanceof ElysiaStatus ? named : deletePoll(named, me())
        );
      }),
    ];
  };

  lifetime.onClose(() => lifetime.cancel(timer));

  return {
    /**
     * A run's state as project `projectId`'s poll last read it (task-waits.ts
     * `settled`); asking puts it on the poll's list, so a wait first read
     * says `checking` until the next poll.
     */
    githubWait(
      projectId: string,
      target: RunTarget
    ): { state: GitHubWaitState; title: string | null } {
      const known = waits.get(target.url);
      waits.set(target.url, {
        projectId,
        state: known?.state ?? "checking",
        title: known?.title ?? null,
        asked: Date.now(),
      });
      return known ?? { state: "checking", title: null };
    },
    /** Why project `projectId` cannot wait on a pull request or run: no GitHub poller to read it; nothing when it can. */
    githubWaitRefusal(projectId: string): string | undefined {
      return store.githubWatches(projectId).length > 0
        ? undefined
        : taskLinkWords.noGitHub;
    },
    createPoll,
    connectionGoing,
    createRoute,
    deletePoll,
    deleteRoute,
    followConnection,
    ingest,
    pollConnectorNow,
    pollGitHubNow,
    start,
    tools,
    updatePoll,
    updateRoute,
    view,
  };
};

export type Ingress = ReturnType<typeof createIngress>;

/** Every ingress tool, by name. */
export const INGRESS_TOOLS: ReadonlySet<string> = new Set([
  "event_route_create",
  "event_route_list",
  "event_route_update",
  "event_route_delete",
  "connector_poll_create",
  "connector_poll_list",
  "connector_poll_update",
  "connector_poll_delete",
]);

const ROUTE_FIELDS = {
  source: t.String(),
  kinds: t.Optional(t.Array(t.String())),
  author: t.Optional(t.Nullable(t.String())),
  label: t.Optional(t.Nullable(t.String())),
  branch: t.Optional(t.Nullable(t.String())),
  regex: t.Optional(t.Nullable(t.String())),
  routineId: t.String(),
  enabled: t.Optional(t.Boolean()),
  mode: t.Optional(t.Nullable(MODE)),
};

const POLL_FIELDS = {
  args: t.Optional(t.Record(t.String(), t.Unknown())),
  intervalS: t.Integer({ minimum: CONNECTOR_MIN_S }),
  itemsPath: t.Optional(t.String()),
  idPath: t.String(),
  versionPath: t.String(),
  enabled: t.Optional(t.Boolean()),
};

/** The dashboard's routes for a project's ingress: its GitHub poller follows the connections that name the project, never a route of its own. */
export const ingressRoutes = (ingress: Ingress) =>
  new Elysia()
    .get("/api/projects/:id/ingress", ({ params }) => ingress.view(params.id))
    .post("/api/projects/:id/ingress/github/poll", ({ params }) =>
      ingress.pollGitHubNow(params.id)
    )
    .post(
      "/api/event-routes",
      { body: t.Object({ projectId: t.String(), ...ROUTE_FIELDS }) },
      ({ body }) => ingress.createRoute(body, "owner")
    )
    .patch(
      "/api/event-routes/:id",
      { body: t.Partial(t.Object(ROUTE_FIELDS)) },
      ({ params, body }) => ingress.updateRoute(params.id, body, "owner")
    )
    .delete("/api/event-routes/:id", ({ params }) =>
      ingress.deleteRoute(params.id, "owner")
    )
    .post(
      "/api/connector-polls",
      {
        body: t.Object({
          projectId: t.String(),
          connection: t.String(),
          tool: t.String(),
          ...POLL_FIELDS,
        }),
      },
      ({ body }) => ingress.createPoll(body, "owner")
    )
    .patch(
      "/api/connector-polls/:id",
      { body: t.Partial(t.Object(POLL_FIELDS)) },
      ({ params, body }) => ingress.updatePoll(params.id, body, "owner")
    )
    .delete("/api/connector-polls/:id", ({ params }) =>
      ingress.deletePoll(params.id, "owner")
    )
    .post("/api/connector-polls/:id/poll", ({ params }) =>
      ingress.pollConnectorNow(params.id)
    );

const EVENT_ROUTE_CREATE_DEFINITION = defineTool(
  "event_route_create",
  "Event routes: your project's inbound events that match (GitHub pull requests, issues, comments; connector poll items) sent to one of its routines as a run's input, the oldest matching route taking each event. Use it when a routine should run on an event rather than a schedule.",
  {
    ...conditions,
    task: z
      .string()
      .describe(
        "The routine's task, like tsk-12: a task that starts on its own."
      ),
    mode: z
      .enum(SESSION_CHOSEN_MODES)
      .optional()
      .describe("Its run's start mode; the routine's when left out."),
  },
  routeWords
);

const EVENT_ROUTE_LIST_DEFINITION = defineTool(
  "event_route_list",
  "Your project's event routes, whether its GitHub repository is polled and why not, its connector polls and its newest inbound events. Use it to see what reaches your routines, and why an event did not.",
  {
    skip: z.number().int().min(0).optional(),
  },
  ingressWords
);

const EVENT_ROUTE_UPDATE_DEFINITION = defineTool(
  "event_route_update",
  "Changes an event route's conditions, routine or mode, or pauses it. Use it on one of your project's routes.",
  {
    id: ref(),
    ...conditions,
    source: conditions.source.optional(),
    task: z.string().optional().describe("The routine's task, like tsk-12."),
    enabled: z.boolean().optional().describe("false pauses it."),
    mode: z.enum(SESSION_CHOSEN_MODES).nullable().optional(),
  },
  routeWords
);

const EVENT_ROUTE_DELETE_DEFINITION = defineTool(
  "event_route_delete",
  "Deletes an event route. Use it for a route no longer wanted; to stop one for a while, pause it with event_route_update.",
  { id: ref() },
  deletedWords("event route")
);

const CONNECTOR_POLL_CREATE_DEFINITION = defineTool(
  "connector_poll_create",
  "Connector polls: a read-only tool of a connection your project grants, called every interval, each new or changed item becoming an inbound event for your routes. Use it to bring a service without webhooks into your routines.",
  {
    connection: z.string(),
    tool: z
      .string()
      .describe("The tool's own name on the connection's server."),
    ...pollFields,
  },
  pollWords
);

const CONNECTOR_POLL_LIST_DEFINITION = defineTool(
  "connector_poll_list",
  "Your project's connector polls, each with what its last call saw or why it failed. Use it to check a poll is seeing items.",
  {},
  pollListWords
);

const CONNECTOR_POLL_UPDATE_DEFINITION = defineTool(
  "connector_poll_update",
  "Changes a connector poll's call or interval, or pauses it. Use it on one of your project's polls.",
  {
    id: ref(),
    args: pollFields.args,
    interval_s: pollFields.interval_s.optional(),
    items_path: pollFields.items_path,
    id_path: pollFields.id_path.optional(),
    version_path: pollFields.version_path.optional(),
    enabled: z.boolean().optional().describe("false pauses it."),
  },
  pollWords
);

const CONNECTOR_POLL_DELETE_DEFINITION = defineTool(
  "connector_poll_delete",
  "Deletes a connector poll. Use it for a poll no longer wanted; to stop one for a while, pause it with connector_poll_update.",
  { id: ref() },
  deletedWords("connector poll")
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const INGRESS_DEFINITIONS = [
  EVENT_ROUTE_CREATE_DEFINITION.listed(),
  EVENT_ROUTE_LIST_DEFINITION.listed(),
  EVENT_ROUTE_UPDATE_DEFINITION.listed(),
  EVENT_ROUTE_DELETE_DEFINITION.listed(),
  CONNECTOR_POLL_CREATE_DEFINITION.listed(),
  CONNECTOR_POLL_LIST_DEFINITION.listed(),
  CONNECTOR_POLL_UPDATE_DEFINITION.listed(),
  CONNECTOR_POLL_DELETE_DEFINITION.listed(),
];
