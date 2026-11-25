/**
 * The door (provider spec §2.5): everything CawCo reads from an outside
 * service comes in through {@link Intake.take}, once. The poll loop
 * (clock.ts), the relay's webhook receiver (relay.ts) and a task's link
 * reads (links.ts `readLinks`) all call it.
 *
 * THE INVARIANTS:
 * - **Stored once.** `take` stores one read or delivery in one transaction
 *   (db/intake.ts): each item revision on the item's one mirror row, where
 *   its version is newer than the one held; each event once per project on
 *   (source, key). A revision the mirror holds and an event whose key is
 *   there store nothing and wake nothing, so a poll and a webhook of one
 *   change land once, in either order. A baseline read (a watch's first)
 *   stores its revisions and keeps its events as already handled.
 * - **Answered at once.** `take` returns as soon as the store is done; a
 *   webhook is answered then, and the poll loop keeps its cursor only then.
 * - **In order, in the project's turn.** The subscribers run after, per
 *   item, oldest event first, one project at a time: links (the tasks that
 *   link the item hear it moved, and a comment on a linked item is filed on
 *   its thread task), sync (empty while the tracker sync keeps its own
 *   poll), lifecycle (a merged pull request an attempt opened moves its
 *   task, dispatch.ts), routing last (event-routes.ts: a route's routine,
 *   else a trigger on the task that links the item, else on the item).
 * - **Run again after a stop.** Each event is marked `processed_at` once
 *   its subscribers ran to the end; at start the hub runs every event left
 *   unmarked again ({@link Intake.start}). Every subscriber is safe to
 *   repeat: a comment is filed once under its own id, a merge's move finds
 *   its task moved, and routing passes over an event a route or a trigger
 *   already took.
 */
import { detach } from "@cawco/core/detach";
import { githubIngest } from "@cawco/providers/github/ingest";
import type {
  Ingested,
  MirrorProvider,
  SourceEvent,
} from "@cawco/providers/provider";
import AsyncLock from "async-lock";
import type { DbShape } from "./db";
import type { ItemRow } from "./db/external-items";
import type { InboundEventRow } from "./db/ingress";
import type { InboundVia } from "./db/stored-types";
import { type InboundEvent, storedEvent } from "./inbound-event";
import { PAYLOAD_MAX } from "./ingress-views";
import { type AnyProblem, isProblem } from "./refusal";

const CUT = "[cut by the hub: the event was over 64 KB]";
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

/** An event as the door stores it: what a route matches and a model reads. */
const payloadOf = (event: SourceEvent): InboundEvent => ({
  source: event.source,
  key: event.key,
  kind: event.kind,
  actor: event.actor?.login ?? null,
  author: event.actor,
  labels: event.labels,
  branch: event.branch,
  url: event.url,
  title: event.title,
  body: event.body,
  at: event.at,
  ...(event.number === undefined ? {} : { number: event.number }),
  ...(event.draft === undefined ? {} : { draft: event.draft }),
  ...(event.comment === undefined ? {} : { comment: event.comment }),
  ...(event.data === undefined ? {} : { data: event.data }),
});

/**
 * The event as stored: JSON of at most {@link PAYLOAD_MAX} bytes. Over it,
 * the body is cut first, with a marker; a record over it is kept as the
 * head of its JSON, marked.
 */
const storedPayload = (source: SourceEvent): string => {
  const event = payloadOf(source);
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

/** The events a revision's move says, by the provider whose item it is (provider spec §2.3 `Ingest.moved`). */
const MOVED: Partial<
  Record<MirrorProvider, NonNullable<typeof githubIngest.moved>>
> = { github: githubIngest.moved };

/** Where a take comes from: its project, the watch it came through (none for a relay's generic delivery), and whose items it holds. */
export interface IntakeAt {
  projectId: string;
  provider: MirrorProvider;
  watchId: string | null;
}

/** One stored event as its subscribers read it. */
export interface Arrived {
  event: InboundEvent;
  row: InboundEventRow;
}

/** What the routing step knows from the steps before it. */
export interface Routing {
  /** A merged pull request moved its task: no trigger. */
  lifecycle: boolean;
  /** The task the event is about; null when none links its item. */
  taskId: string | null;
}

/** The subscribers that run for a stored event, in order (provider spec §2.5). */
export interface IntakeSubscribers {
  /** A merged pull request an attempt opened moves its task: the task, when it is this project's. */
  readonly lifecycle: (arrived: Arrived) => Promise<string | undefined>;
  /** The thread task of the event's item, its comment filed there (links.ts `onEvent`); the task's refusal of the comment. */
  readonly links: (arrived: Arrived) => Promise<string | null | AnyProblem>;
  /** The items whose state or title a take moved: the tasks that link them look again (links.ts `moved`). */
  readonly linksMoved: (projectId: string, items: readonly ItemRow[]) => void;
  /** Routes, then a trigger (event-routes.ts `route`). */
  readonly route: (arrived: Arrived, routing: Routing) => Promise<void>;
}

export interface IntakeDeps {
  readonly db: Pick<DbShape, "ingress" | "intake">;
  /** An event landed for a project, stored once: its starters are asked again (project-starters.ts). */
  readonly eventLanded: (projectId: string) => void;
  readonly subscribers: IntakeSubscribers;
}

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const createIntake = ({ db, eventLanded, subscribers }: IntakeDeps) => {
  /** Each project's turn: its events' subscribers run one at a time. */
  const turns = new AsyncLock({ maxPending: Number.POSITIVE_INFINITY });

  /** The four subscribers for one stored event, in order; marked processed once they all ran. */
  const runOne = async (row: InboundEventRow): Promise<void> => {
    const said = `[intake] ${row.source} ${row.deliveryKey}`;
    const event = storedEvent(row);
    const arrived: Arrived = { event, row };
    try {
      const linked = await subscribers.links(arrived);
      if (isProblem(linked)) {
        console.warn(
          `${said} stays unprocessed, and runs again at the hub's next start: ${linked.response.detail}`
        );
        return;
      }
      let taskId = linked;
      console.log(
        `${said}: links${taskId ? `, linked to ${taskId}` : ", linked to no task"}`
      );
      const moved = await subscribers.lifecycle(arrived);
      if (moved) {
        taskId = moved;
        console.log(`${said}: lifecycle moved ${moved}`);
      }
      if (taskId !== row.taskId) {
        db.ingress.setEvent(row.id, { taskId });
      }
      const fresh = db.ingress.event(row.id) ?? row;
      await subscribers.route(
        { event, row: { ...fresh, taskId } },
        { taskId, lifecycle: moved !== undefined }
      );
      console.log(`${said}: routing done`);
      db.ingress.setEvent(row.id, { processedAt: new Date() });
    } catch (error) {
      console.warn(
        `${said} stays unprocessed, and runs again at the hub's next start: ${wordsOf(error)}`
      );
    }
  };

  /** A project's stored events run in its turn, per item, oldest event first. */
  const process = (
    projectId: string,
    rows: readonly InboundEventRow[],
    moved: readonly ItemRow[]
  ): Promise<void> =>
    turns.acquire(projectId, async () => {
      if (moved.length > 0) {
        subscribers.linksMoved(projectId, moved);
      }
      const atOf = (row: InboundEventRow): number => {
        const { at } = storedEvent(row);
        return at > 0 ? at : row.receivedAt.getTime();
      };
      const byItem = new Map<string, InboundEventRow[]>();
      for (const row of [...rows].sort((a, b) => atOf(a) - atOf(b))) {
        const key = row.itemId ?? row.id;
        byItem.set(key, [...(byItem.get(key) ?? []), row]);
      }
      for (const group of byItem.values()) {
        for (const row of group) {
          await runOne(row);
        }
      }
    });

  /** Runs a project's stored events, detached: a take answers before they run. */
  const later = (
    projectId: string,
    rows: readonly InboundEventRow[],
    moved: readonly ItemRow[]
  ): void => {
    if (rows.length === 0 && moved.length === 0) {
      return;
    }
    detach(
      process(projectId, rows, moved).catch((error: unknown) =>
        console.warn(
          `[intake] project ${projectId}'s events did not run: ${wordsOf(error)}`
        )
      ),
      "run a project's inbound events"
    );
  };

  /**
   * THE door: one read or delivery stored once, then its subscribers run
   * in the project's turn. Answers how many events it stored, once the
   * store is done.
   */
  const take = (
    at: IntakeAt,
    ingested: Ingested,
    via: InboundVia,
    baseline: boolean
  ): number => {
    const moved = MOVED[at.provider];
    const taken = db.intake.take({
      projectId: at.projectId,
      watchId: at.watchId,
      ingested,
      via,
      baseline,
      payloadOf: storedPayload,
      ...(moved ? { moved } : {}),
    });
    for (const { row } of taken.events) {
      console.log(
        `[intake] ${row.source} ${row.deliveryKey} landed via ${via}`
      );
    }
    if (taken.events.length > 0) {
      eventLanded(at.projectId);
    }
    later(
      at.projectId,
      taken.events.map(({ row }) => row),
      taken.moved
    );
    return taken.events.length;
  };

  /** Hub start: every event a stopped hub left unprocessed runs again, in its project's turn. */
  const start = (): void => {
    const left = db.intake.unprocessed();
    if (left.length > 0) {
      console.log(
        `[intake] ${left.length} event${left.length === 1 ? "" : "s"} a stopped hub left unprocessed run again`
      );
    }
    const byProject = new Map<string, InboundEventRow[]>();
    for (const row of left) {
      byProject.set(row.projectId, [
        ...(byProject.get(row.projectId) ?? []),
        row,
      ]);
    }
    for (const [projectId, rows] of byProject) {
      later(projectId, rows, []);
    }
  };

  /** Resolves once every project's events taken so far have run: for a caller that reads what they did. */
  const settled = (projectId: string): Promise<void> =>
    turns.acquire(projectId, () => Promise.resolve());

  return { settled, start, take };
};

export type Intake = ReturnType<typeof createIntake>;
