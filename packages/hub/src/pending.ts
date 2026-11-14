import { ASK_USER_QUESTION } from "@cawco/core/ask-tools";
import type { AskAnswer, AskRecord } from "@cawco/core/asks";
import type { ParkedAsk } from "@cawco/core/frames";
import type { Envelope, InstanceRow } from "@cawco/core/protocol";
import type { PermissionResult } from "@cawco/core/session-messages";
import { ParkedAskShape } from "@cawco/core/stored-shapes";
import { Context, Effect, Layer } from "effect";
import { Db, type DbShape } from "./db";
import { parkedToolAsk } from "./parked-ask";
import type { AnyProblem } from "./refusal";
import { received } from "./stored-json";

/**
 * Permission and dialog requests the agent is blocked on, keyed by SDK
 * `requestId`, so a dashboard that connects mid-prompt can still answer it.
 *
 * A session's own asks outlive this hub, as the process blocked on them does:
 * they are kept in the database and read back as it boots, so the hub that
 * comes back holds them before any agent has replayed its own, and every
 * screen that reads `/api/pending` meanwhile still shows them. An ask the
 * hub owns (core asks.ts, its `asks` row) is listed here as the envelope
 * every screen reads ({@link askEnvelope}), from its row as the hub boots.
 */
export interface PendingShape {
  /**
   * A relaunch or a death answers every question its process had open; an
   * ask the hub owns stays ({@link outlivesSession}).
   */
  readonly forget: (instanceId: string) => void;
  /** The parked ask itself, for whoever answers it away from a dashboard. */
  readonly get: (requestId: string) => ParkedAsk | undefined;
  readonly list: () => ParkedAsk[];
  /**
   * The one place an ask's end is heard: called for every parked ask that
   * leaves, by `resolve` or `forget`, whichever path settled it. Set once by
   * the server, which tells every dashboard.
   */
  readonly onSettled: (listener: SettledListener) => void;
  /**
   * Set once by the server: stamps what an ask says on every surface (its
   * `presentation`, ask-presentation.ts) onto its payload. Every ask already
   * held, the ones kept across a restart included, is stamped at once, and
   * every ask parked after it as it parks.
   */
  readonly presentWith: (present: Presenter) => void;
  /**
   * `outlivesHub` marks a session process's own ask, which is kept across
   * this hub's restart; one the hub raised for itself is not.
   */
  readonly remember: (
    requestId: string,
    envelope: Envelope,
    outlivesHub?: boolean
  ) => boolean;
  /** `said`: what the hub can say of how the ask ended ({@link Settlement}). */
  readonly resolve: (
    requestId: string,
    outcome?: "answered" | "cancelled",
    said?: Settlement
  ) => boolean;
  /**
   * A parked ask routed to its session's parent made the person's: its
   * `routedTo` gone from the parked copy and from what the hub keeps of it
   * (the process's kept copy, or the hub's own ask's row), so a restart
   * reads it back as the person's.
   */
  readonly unroute: (requestId: string) => void;
}

/** What the hub can say of how an ask ended, beyond answered or cancelled. */
interface Settlement {
  /** An answered ask: what won and where it came from. */
  answer?: AskAnswer;
  /**
   * A shown ask the hub closed on its own because it no longer applies (its
   * session ended for good, a proposal's file changed under it): why, a
   * sentence with no stop, said to whoever hears it end.
   */
  closed?: string;
  /**
   * A cancellation the hub can explain: an ask it could not show anyone
   * (`askRefusal` in server.ts).
   */
  why?: string;
}

/** Hears every parked ask that leaves, with what the hub could say of it. */
type SettledListener = (
  envelope: Envelope,
  outcome: "answered" | "cancelled",
  said?: Settlement
) => void;

/** Stamps a parked ask's presentation onto its payload. */
type Presenter = (envelope: Envelope) => void;

/**
 * An ask the hub owns (core asks.ts) as the `permission_request` every
 * screen, push and answer reads today: the one shim from its row to the
 * ledger, until the screens read the rows themselves. A question parks as
 * an {@link ASK_USER_QUESTION}, which every card, push and answer path
 * draws and answers as a question, its `blocks` with it for the card's line
 * (core permission-presentation.ts); an approve ask as the CawCo call it
 * approves. `askId` marks both as the hub's own. A permit routed to its
 * session's parent carries `routedTo`, as its live prompt did, so every
 * screen and push that left the prompt to the parent leaves the permit too.
 */
export const askEnvelope = (
  ask: AskRecord,
  asker: Pick<InstanceRow, "harness" | "id" | "machineId">
): Envelope => {
  const where = {
    askId: ask.id,
    raisedAt: ask.raisedAt,
    ...(ask.routedTo ? { routedTo: ask.routedTo } : {}),
    ...(ask.toolUseId ? { toolUseId: ask.toolUseId } : {}),
  };
  const { asked } = ask;
  if (asked.kind === "question") {
    const { kind: _kind, ...input } = asked;
    return parkedToolAsk(asker, ask.id, ASK_USER_QUESTION, input, {
      ...where,
      requestKind: "question",
    });
  }
  // A permit is the harness's own prompt, by the harness's tool name.
  if (asked.kind === "permit") {
    return parkedToolAsk(asker, ask.id, asked.tool, asked.input, where);
  }
  return parkedToolAsk(
    asker,
    ask.id,
    `mcp__cawco__${asked.tool}`,
    asked.input,
    {
      ...where,
      ...(asked.source ? { sourceFacts: asked.source } : {}),
    }
  );
};

/**
 * Whether an ask stays when its session's process ends: one the hub owns
 * ({@link askEnvelope}). No process waits on it; it goes only when its
 * session ends for good (asks.ts `withdrawEnded`).
 */
export const outlivesSession = (envelope: Envelope): boolean =>
  (envelope.payload as { askId?: unknown } | undefined)?.askId !== undefined;

export class Pending extends Context.Service<Pending, PendingShape>()(
  "Pending"
) {}

/** `from`: where the answer was given, said with the ask's end to every screen. */
type AnswerHandler = (
  instanceId: string,
  requestId: string,
  result: PermissionResult,
  from: AnswerFrom
) => Promise<AnyProblem | undefined>;
/** Where an answer was given: an {@link AskAnswer} without its behaviour, which the answer itself carries. */
export type AnswerFrom = Omit<AskAnswer, "behavior">;
const permissionAnswers = new WeakMap<PendingShape, AnswerHandler>();
export const onPermissionAnswer = (
  pending: PendingShape,
  handler: AnswerHandler
) => permissionAnswers.set(pending, handler);
/** Every device waits for the same delivered-and-settled receipt. */
export const answerPermission = (
  pending: PendingShape,
  instanceId: string,
  requestId: string,
  result: PermissionResult,
  from: AnswerFrom
): Promise<AnyProblem | undefined> => {
  const handler = permissionAnswers.get(pending);
  if (!handler) {
    return Promise.reject(new Error("Permission answering is not ready."));
  }
  return handler(instanceId, requestId, result, from);
};

/** The payload field the hub stamps; see `raisedAt` on `permission_request`. */
const raisedAtOf = (envelope: Envelope | undefined): number | undefined => {
  const at = (envelope?.payload as { raisedAt?: unknown } | undefined)
    ?.raisedAt;
  return typeof at === "number" ? at : undefined;
};

/** The open asks the hub owns, as envelopes; one whose session is gone is withdrawn at boot (asks.ts). */
const ownedAsks = (db: DbShape): Envelope[] => {
  const open = db.asks.open();
  const askers = new Map(
    db
      .getInstancesByIds(open.map((ask) => ask.instanceId))
      .map((row) => [row.id, row] as const)
  );
  return open.flatMap((ask) => {
    const asker = askers.get(ask.instanceId);
    return asker ? [askEnvelope(ask, asker)] : [];
  });
};

/** An envelope that says what it asks, taken into `ParkedAsk`: what a machine stamped beside its declared keys is left out (hub stored-json.ts `received`). */
const taken = (envelope: Envelope): ParkedAsk =>
  received(ParkedAskShape, envelope, "a machine's permission ask");

const make = (db: DbShape): PendingShape => {
  const parked = db.parkedAsks;
  // A machine's envelope, taken into CawCo's type as it is kept: what the
  // machine stamped beside its declared keys is left out (core
  // stored-json.ts `received`).
  const kept = parked;
  // What the hub held parked when it last stopped, by request id. The asks
  // the hub owns join it as the presenter stamps them (`presentWith`): an ask
  // is a `ParkedAsk` once it says what it asks.
  const requests = new Map<string, ParkedAsk>(
    kept
      .list()
      .flatMap((envelope) =>
        envelope.requestId ? [[envelope.requestId, envelope] as const] : []
      )
  );
  const owned = ownedAsks(db);
  // A daemon replay must not resurrect a request that already left this ledger.
  const settledIds = new Set<string>();
  let settled: SettledListener | undefined;
  let present: Presenter | undefined;
  const resolve: PendingShape["resolve"] = (requestId, outcome, said) => {
    const envelope = requests.get(requestId);
    if (!envelope) {
      return false;
    }
    requests.delete(requestId);
    kept.drop(requestId);
    settledIds.add(requestId);
    settled?.(envelope, outcome ?? "answered", said);
    return true;
  };

  return {
    onSettled: (listener) => {
      settled = listener;
    },
    presentWith: (presenter) => {
      present = presenter;
      for (const envelope of requests.values()) {
        presenter(envelope);
      }
      for (const envelope of owned.splice(0)) {
        presenter(envelope);
        const ask = taken(envelope);
        if (ask.requestId) {
          requests.set(ask.requestId, ask);
        }
      }
    },
    /**
     * Parks an ask and stamps the moment the hub first saw it onto its
     * payload, before the payload is relayed or replayed from `/api/pending`.
     * A daemon replay of the same request keeps the first stamp, so the wait
     * every device shows is the same wait, a replay after this hub restarted
     * included. An ask the hub raises itself may carry its own first stamp,
     * which stands.
     */
    remember: (requestId, envelope, outlivesHub = false) => {
      if (settledIds.has(requestId)) {
        return false;
      }
      if (!present) {
        throw new Error(
          "An ask was parked before the hub could say what it asks."
        );
      }
      present(envelope);
      const payload = envelope.payload as Record<string, unknown>;
      payload.raisedAt =
        raisedAtOf(requests.get(requestId)) ??
        raisedAtOf(envelope) ??
        Date.now();
      const ask = taken(envelope);
      requests.set(requestId, ask);
      // A process's prompt the hub now owns (asks.ts `keep`) is read back
      // from its row, no longer from the process's kept copy.
      if (outlivesHub) {
        kept.save(requestId, ask);
      } else {
        kept.drop(requestId);
      }
      return true;
    },
    get: (requestId) => requests.get(requestId),
    unroute: (requestId) => {
      const envelope = requests.get(requestId);
      const payload = envelope?.payload;
      if (!(envelope && payload?.routedTo !== undefined)) {
        return;
      }
      // biome-ignore lint/performance/noDelete: the payload is broadcast verbatim, so the field must be absent, not present-but-undefined.
      delete payload.routedTo;
      if (payload.askId === undefined) {
        kept.save(requestId, envelope);
      } else {
        db.asks.unroute(requestId);
      }
    },
    resolve,
    forget: (instanceId) => {
      for (const [requestId, envelope] of requests) {
        if (envelope.instanceId === instanceId && !outlivesSession(envelope)) {
          resolve(requestId, "cancelled");
        }
      }
    },
    list: () => [...requests.values()],
  };
};

export const PendingLayer = Layer.effect(Pending)(
  Effect.gen(function* () {
    const db = yield* Db;
    return make(db);
  })
);
