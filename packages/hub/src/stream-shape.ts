import type { FramePayload } from "@cawco/core/frames";
import type { PlanDelta, PlanSnapshot } from "@cawco/core/plan";
import type { DeliveryMark, IngestMark } from "@cawco/core/protocol";
import type {
  FrameProvenance,
  SessionStreamEvent,
  SessionStreamFrame,
} from "@cawco/core/stream";
import type { ClientSocket } from "./wire-socket";

/**
 * The `control_result` shape a settled command reads: exactly the frame the
 * daemon already sends back for every control it runs.
 */
export type ControlResultFrame = Extract<
  FramePayload,
  { kind: "control_result" }
>;

export interface StreamHubShape {
  /**
   * THE INGEST LEDGER (sessiond design §7). Files one frame's provenance and
   * answers whether it may become a hub frame at all: `false` is a line this
   * hub has already ingested under this epoch — a duplicate the caller must
   * drop rather than sequence.
   *
   * A frame with no provenance (an opencode or a pi session's) is always
   * admitted and advances nothing: it is not deduped by a mark that does not
   * exist.
   *
   * THE DELIVERY LEDGER beside it (core stream.ts `DeliveryMark`): a frame
   * whose `sent` stamp this hub already took from the same agent process is
   * refused too, so a frame an agent sends again after its link came back is
   * drawn once.
   */
  readonly admitFrame: (
    instanceId: string,
    provenance: FrameProvenance | undefined,
    sent: DeliveryMark | undefined
  ) => boolean;
  /**
   * The hub's delivery mark for each instance named, for the register's and
   * every heartbeat's ack: the agent sends again what it has past it, and
   * lets go of what it covers. An instance this hub took nothing of from that
   * agent process is absent.
   */
  readonly deliveredFor: (
    instanceIds: readonly string[]
  ) => Record<string, DeliveryMark>;
  /** A dashboard socket is gone: it follows nothing and awaits nothing. */
  readonly dropSocket: (socketId: string) => void;
  /** How many sockets follow a session — for tests and for reasoning about fan-out. */
  readonly followerCount: (sessionId: string) => number;
  /**
   * Handles a message on the dashboard socket that belongs to this protocol.
   * Returns true when it consumed it, so the envelope path never sees a shape
   * it would only log as malformed.
   */
  readonly handleClientMessage: (socket: ClientSocket, raw: unknown) => boolean;
  /** The last seq assigned to a session; 0 when it has never been relayed. */
  readonly head: (sessionId: string) => number;
  /**
   * What the register ack hands back: the hub's mark for each instance the
   * daemon says it is holding. An instance with no entry is simply absent —
   * "I have nothing of yours", which the agent reads as follow-from-head. Never
   * a zero mark, which would read as "I have line 0 of your current epoch" and
   * ask for a replay of everything.
   */
  readonly ingestedFor: (
    instanceIds: readonly string[]
  ) => Record<string, IngestMark>;
  /** A session's plan frame, to every socket following it. */
  readonly planToFollowers: (
    sessionId: string,
    message: PlanSnapshot | PlanDelta
  ) => void;
  /**
   * Stamps a relayed frame with the session's next `seq`, files it in the ring
   * and fans it out to that session's followers. Called for EVERY relayed
   * frame, subscribed or not: the sequence is the session's canonical order,
   * not a function of who happens to be listening, and a ring with holes in it
   * could not answer a resume.
   */
  readonly sequence: (
    sessionId: string,
    frame: SessionStreamFrame
  ) => SessionStreamEvent;
  /**
   * A `control_result` off an agent socket. Returns true when it answered a
   * command — that reply is that command's ack and nobody else's news, exactly
   * as a routed requester's reply is today.
   */
  readonly settleCommand: (
    requestId: string,
    result: ControlResultFrame
  ) => boolean;
  /**
   * Runs the housekeeping the interval runs: forgets commands whose reply never
   * came and the replay windows of sessions gone quiet. Returns how many rings
   * it emptied. Exposed so the RULE can be tested without waiting on a clock.
   */
  readonly sweepStale: (now?: number) => number;
}
