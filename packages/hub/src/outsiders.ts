/**
 * Outsiders (provider spec §2.5 step 4, the owner's decision on D2): what
 * happens to the words of someone an outside service does not vouch for
 * (GitHub: no owner, member or collaborator of the repository; Linear: an
 * integration's, no member behind it), on every path alike, by the
 * project's rule (`projects.outsiders`, core outsiders.ts).
 *
 * - **`hold`, the default.** Their event (an issue or pull request opened,
 *   a discussion started, a comment) goes to no route and raises no
 *   trigger, so no session starts on it. It is held where the person sees
 *   it: on the task that links its item, which moves to the project's
 *   first stage of kind `you` (Needs you on the board) when it stands where
 *   an agent would take it, so the person's move takes it on (as the
 *   tracker sync holds an unvouched opener's issue, sync.ts `fileTask`,
 *   `holdPulls`); else, on an item no task links, in Caw's Needs you as an
 *   offer (core `WaitingOffer` `outsider`), its events folded by item, until
 *   the person lets them through or drops them ({@link Outsiders.answer}).
 *   Switching the project's triggers on never lets one through.
 * - **`start`.** Their event goes on as anyone's: routes, then a trigger,
 *   a session reading their words inside the untrusted-data block
 *   (inbound-event.ts `eventData`), as every event's.
 * - An event of theirs that is not their words (a close, a label, a
 *   merge, whoever made it) goes on as any event.
 */

import { isOneOf } from "@cawco/core/one-of";
import type { OutsiderRule } from "@cawco/core/outsiders";
import type { WaitingOffer } from "@cawco/core/project-conversation";
import type { Stage } from "@cawco/core/task-views";
import { TRACKERS } from "@cawco/core/trackers";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { DbShape } from "./db";
import type { InboundEventRow } from "./db/ingress";
import { HELD_OUTSIDER } from "./db/intake";
import { storedEvent } from "./inbound-event";
import type { Arrived, Intake } from "./intake";
import type { TaskActor, Tasks } from "./tasks";

/** The events that carry their author's own words. */
const THEIR_WORDS: ReadonlySet<string> = new Set([
  "issue.opened",
  "pr.opened",
  "discussion.created",
  "comment.created",
  "discussion_comment.created",
]);

/** The kinds of stage a task goes on from with no person: the dispatcher starts a `todo` one, an `active` one's `runs:` starts on entering, a routine moves a `waiting` one on. */
const UNATTENDED: ReadonlySet<Stage["kind"]> = new Set([
  "todo",
  "active",
  "waiting",
]);

/** A line as an offer shows it: the first that holds words, cut. */
const FIRST_LINE_MAX = 160;
const firstLine = (text: string | null): string => {
  const line =
    (text ?? "")
      .split("\n")
      .map((one) => one.trim())
      .find((one) => one.length > 0) ?? "";
  return line.length > FIRST_LINE_MAX
    ? `${line.slice(0, FIRST_LINE_MAX)}…`
    : line;
};

export interface OutsidersDeps {
  readonly db: Pick<DbShape, "ingress" | "intake" | "project">;
  /** The offers in Needs you changed: every dashboard hears the list (offers-waiting.ts `changed`). */
  readonly offersChanged: () => void;
  /** An event let through: routed as it would have been, routes then a trigger (event-routes.ts `route`). */
  readonly route: (arrived: Arrived) => Promise<void>;
  readonly tasks: Pick<Tasks, "get" | "move" | "stages">;
  /** The project's turn (intake.ts `turn`). */
  readonly turn: Intake["turn"];
}

export const createOutsiders = ({
  db,
  offersChanged,
  route,
  tasks,
  turn,
}: OutsidersDeps) => {
  /** The project's rule; `hold` when the project is gone. */
  const ruleOf = (projectId: string): OutsiderRule =>
    db.project(projectId)?.outsiders ?? "hold";

  /** Why the service does not vouch for the event's author, when the event is their words; undefined for anyone else's. */
  const outsiderOf = ({ event }: Arrived): string | undefined =>
    THEIR_WORDS.has(event.kind)
      ? (event.author?.unvouched ?? undefined)
      : undefined;

  /**
   * The task an outsider's words landed on, held for the person: moved to
   * the project's first stage of kind `you` when it stands where an agent
   * takes it. False when the project has no such stage, or the task does
   * not read: the event is held on its item instead.
   */
  const holdTask = async (
    { event, row }: Arrived,
    taskId: string,
    unvouched: string,
    synced: boolean
  ): Promise<boolean> => {
    const [staged, task] = await Promise.all([
      tasks.stages(row.projectId),
      tasks.get(row.projectId, taskId),
    ]);
    if (staged instanceof ElysiaStatus || task instanceof ElysiaStatus) {
      return false;
    }
    const hold = staged.stages.find((stage) => stage.kind === "you");
    if (!hold) {
      return false;
    }
    const standing = staged.stages.find((stage) => stage.name === task.stage);
    if (!(standing && UNATTENDED.has(standing.kind))) {
      return true;
    }
    const source = event.author?.source;
    const actor: TaskActor = {
      mover: "hub",
      author: { name: source === "linear" ? "Linear" : "GitHub" },
      reason: `${task.id} has words from ${unvouched}: it waits in ${hold.name} for you before any agent takes it`,
      // The tracker sync's own hold, never sent back to its tracker.
      ...(synced && isOneOf(TRACKERS, source) ? { tracker: source } : {}),
    };
    const moved = await tasks.move(row.projectId, taskId, hold.name, actor);
    if (moved instanceof ElysiaStatus) {
      console.warn(
        `[outsiders] ${row.source} ${row.deliveryKey}: ${taskId} could not move to ${hold.name}: ${moved.response.detail}`
      );
    }
    return true;
  };

  /**
   * Step 4 of the door's subscribers (intake.ts): whether the event is an
   * outsider's words the project holds. Held on its task, it is handled
   * with no route and no trigger; held on its item, it waits in Needs you.
   */
  const hold = async (
    arrived: Arrived,
    taskId: string | null,
    synced: boolean
  ): Promise<boolean> => {
    const unvouched = outsiderOf(arrived);
    const { row } = arrived;
    if (unvouched === undefined || ruleOf(row.projectId) !== "hold") {
      return false;
    }
    if (taskId && (await holdTask(arrived, taskId, unvouched, synced))) {
      db.ingress.setEvent(row.id, { handledAt: new Date() });
      console.log(
        `[outsiders] ${row.source} ${row.deliveryKey}: by ${unvouched}, held on ${taskId}`
      );
      return true;
    }
    db.ingress.setEvent(row.id, { routedTo: HELD_OUTSIDER });
    console.log(
      `[outsiders] ${row.source} ${row.deliveryKey}: by ${unvouched}, held in Needs you`
    );
    offersChanged();
    return true;
  };

  /** Every outsider's words held in Needs you, folded by item, oldest first: what the offers list carries. */
  const held = (): WaitingOffer[] => {
    const byItem = new Map<string, InboundEventRow[]>();
    for (const row of db.intake.heldOutsiders()) {
      const key = `${row.projectId}\0${row.itemId ?? row.id}`;
      byItem.set(key, [...(byItem.get(key) ?? []), row]);
    }
    return [...byItem.values()].flatMap((rows) => {
      const [first] = rows;
      const last = rows.at(-1);
      if (!(first && last)) {
        return [];
      }
      const event = storedEvent(first);
      const item = first.itemId ? db.intake.item(first.itemId) : undefined;
      const offer: WaitingOffer = {
        kind: "outsider",
        projectId: first.projectId,
        itemId: first.itemId ?? first.id,
        ref: item?.ref ?? event.key,
        title: item?.title ?? event.title ?? "",
        url: item?.url ?? event.url,
        actor: event.actor ?? "someone",
        unvouched: event.author?.unvouched ?? "",
        firstLine: firstLine(event.body),
        count: rows.length,
        offeredAt: first.receivedAt.getTime(),
        lastAt: last.receivedAt.getTime(),
      };
      return [offer];
    });
  };

  /**
   * The person's answer to an outsider's held words on an item: `accept`
   * routes each as it would have gone (routes, then a trigger, their words
   * inside the untrusted-data block), `decline` puts them away handled. In the
   * project's turn. False when nothing of theirs waits there.
   */
  const answer = (
    projectId: string,
    itemId: string,
    answered: "accept" | "decline"
  ): Promise<boolean> =>
    turn(projectId, async () => {
      const rows = db.intake
        .heldOutsiders()
        .filter(
          (row) =>
            row.projectId === projectId && (row.itemId ?? row.id) === itemId
        );
      for (const row of rows) {
        if (answered === "decline") {
          db.ingress.setEvent(row.id, { handledAt: new Date() });
          continue;
        }
        db.ingress.setEvent(row.id, { routedTo: null });
        const fresh = db.ingress.event(row.id) ?? row;
        await route({ event: storedEvent(fresh), row: fresh });
      }
      if (rows.length > 0) {
        console.log(
          `[outsiders] ${projectId}: ${rows.length} held on item ${itemId} ${answered === "accept" ? "let through" : "dropped"} by the person`
        );
        offersChanged();
      }
      return rows.length > 0;
    });

  return { answer, held, hold };
};

export type Outsiders = ReturnType<typeof createOutsiders>;

/** The person's answer to an outsider's held words (Needs you's offer). One of the person's own acts (person-acts.ts). */
export const outsiderRoutes = (outsiders: Outsiders) =>
  new Elysia().post(
    "/api/projects/:id/outsiders/answer",
    {
      body: t.Object({
        itemId: t.String({ minLength: 1, maxLength: 200 }),
        answer: t.Union([t.Literal("accept"), t.Literal("decline")]),
      }),
    },
    async ({ params, body }) =>
      (await outsiders.answer(params.id, body.itemId, body.answer))
        ? { ok: true as const }
        : problem(404, {
            code: "outsider-held-unknown",
            detail: "Nothing of an outsider's waits on that item in Needs you.",
          })
  );
