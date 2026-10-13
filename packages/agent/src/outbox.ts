/**
 * THE OUTBOX: nothing a session produces is lost because the link between its
 * machine and the hub dropped, whether the hub restarted or only the link
 * went (Wi-Fi, a suspended laptop, a hub whose loop stalled).
 *
 * Every frame a session writes is stamped with this agent process's own
 * count of the frames it has sent that session (core stream.ts
 * `DeliveryMark`: `epoch`, random per process; `seq`, 1 up) and kept, in
 * order, until the hub says it took it: its delivery mark rides every
 * heartbeat's ack, and what the mark covers is let go. A frame made while
 * the link is down is kept unsent. A link that looks open can be dead (a
 * socket on a network that went away takes what it is given and delivers
 * none of it), so a sent frame is kept too, until the mark covers it.
 *
 * On every register, ahead of anything new (`linkUp`):
 *  - the same hub process as before (`hubEpoch`) sends back its mark for each
 *    session: every frame past it is sent again, sent once already or not,
 *    and the hub's delivery ledger refuses whatever it did take
 *    (hub stream.ts `admitFrame`), so each is drawn once;
 *  - a hub process this agent has not registered with before (it restarted)
 *    has nothing of this agent's: the frames never handed to a socket are
 *    sent; those handed to the hub before it went are taken as its, for
 *    sending them to the hub that replaced it would do twice what they did
 *    (a turn's cost, a delegate's report), and what they drew is in the
 *    transcript it reads from the machine.
 * Then each session's reply so far goes as one {@link STREAM_SO_FAR} frame
 * (stream-so-far.ts): partials are never kept here, since the reply so far
 * says all of them at once, and only it can say the ones a restarted hub
 * took before it went.
 *
 * Partials go out live when nothing is waiting ahead of them and are dropped
 * otherwise, for the same reason.
 *
 * At most {@link OUTBOX_BYTES} are kept, across the machine's sessions. Past
 * it the oldest go first; a session whose frames went before the hub could
 * have taken them is sent one {@link FRAMES_LOST} ahead of the rest, and the
 * hub reads its transcript from the machine again: what was stored is drawn,
 * and what only those frames said is lost, said once.
 *
 * Not covered here, and by what:
 *  - an agent that restarted holds nothing of its predecessor's: a session
 *    sessiond holds (Claude, pi) replays its ring from the hub's ingest mark
 *    (session.ts `#adoptClaimed`), and the rest is in the stored transcript;
 *  - a machine that slept wrote nothing meanwhile: what it handed its socket
 *    before it slept is kept until acknowledged, as for a dropped link, and
 *    the dead socket is noticed by the heartbeat's deadline (daemon.ts).
 */
import {
  type DeliveryMark,
  FRAMES_LOST,
  type HarnessKind,
  type NeutralMessage,
  type NeutralSystemMessage,
} from "@cawco/core";

/** How much the outbox keeps, across every session on the machine. */
export const OUTBOX_BYTES = 32 * 1024 * 1024;

/** One session frame, as the supervisor hands it to its sink. */
export interface OutboxFrame {
  harness: HarnessKind;
  instanceId: string;
  keepAlive?: true;
  kind: "frame";
  message: NeutralMessage;
  processGeneration?: string;
  sent?: DeliveryMark;
  srcEpoch?: string;
  srcSeq?: number;
}

interface Kept {
  bytes: number;
  frame: OutboxFrame & { sent: DeliveryMark };
  /** Handed to a socket; whether the hub took it, its mark says. */
  handed: boolean;
  /** Its place across the machine's sessions, for letting the oldest go first. */
  order: number;
}

/** What a register's ack says that the outbox reads. */
export interface LinkUp {
  delivered: Record<string, DeliveryMark>;
  hubEpoch: string | undefined;
}

export class Outbox {
  /** This agent process: every `sent` stamp is counted in it. */
  readonly epoch = crypto.randomUUID();
  readonly #seq = new Map<string, number>();
  readonly #kept = new Map<string, Kept[]>();
  #bytes = 0;
  #order = 0;
  /** Per session, the newest seq let go before the hub was known to have it: handed (`handed`), or never (`unsent`). */
  readonly #lost = new Map<string, { handed: number; unsent: number }>();
  /** The link is up and every kept frame that was due has gone. */
  #ready = false;
  /** The hub process this agent last registered with. */
  #hubEpoch: string | undefined;
  readonly #send: (frame: OutboxFrame) => boolean;
  readonly #log: (line: string) => void;

  constructor(
    send: (frame: OutboxFrame) => boolean,
    log: (line: string) => void
  ) {
    this.#send = send;
    this.#log = log;
  }

  /**
   * One frame a session wrote. A partial (`stream_event`) goes out live when
   * the link is up and nothing is waiting ahead of it, else nowhere: the
   * reply so far carries it. Anything else is stamped, kept, and handed now
   * when the link is up and nothing of its session is waiting ahead of it.
   */
  frame(frame: OutboxFrame): void {
    const { instanceId } = frame;
    const waiting = this.#waiting(instanceId);
    if (frame.message.type === "stream_event") {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: #ready is set true by linkUp(), a different method biome's per-method inference doesn't see
      if (this.#ready && !waiting) {
        this.#hand(frame);
      }
      return;
    }
    const seq = (this.#seq.get(instanceId) ?? 0) + 1;
    this.#seq.set(instanceId, seq);
    const stamped = { ...frame, sent: { epoch: this.epoch, seq } };
    this.#order += 1;
    const kept: Kept = {
      frame: stamped,
      bytes: JSON.stringify(stamped).length,
      handed: false,
      order: this.#order,
    };
    const list = this.#kept.get(instanceId) ?? [];
    list.push(kept);
    this.#kept.set(instanceId, list);
    this.#bytes += kept.bytes;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #ready is set true by linkUp(), a different method biome's per-method inference doesn't see
    if (this.#ready && !waiting) {
      kept.handed = this.#hand(stamped);
    }
    this.#trim();
  }

  /** The socket is gone: what comes next waits for the next register. */
  linkDown(): void {
    this.#ready = false;
  }

  /**
   * A register was acknowledged: what each session is owed goes again,
   * ahead of anything new (see the file's comment), then `after` (the reply
   * so far), and the link is up.
   */
  linkUp(ack: LinkUp, after: () => void): void {
    const sameHub =
      ack.hubEpoch !== undefined && ack.hubEpoch === this.#hubEpoch;
    this.#hubEpoch = ack.hubEpoch;
    for (const instanceId of this.#kept.keys()) {
      if (!this.#resend(instanceId, ack.delivered[instanceId], sameHub)) {
        // The link went again on the way: the next register goes on from here.
        return;
      }
    }
    after();
    this.#ready = true;
  }

  /**
   * One session's due on a register: what the hub took (its mark), or with a
   * hub new to this agent what was handed to the one before it, is let go;
   * the rest goes again in order, behind a {@link FRAMES_LOST} when frames it
   * did not have were let go past the cap. Whether the link held.
   */
  #resend(
    instanceId: string,
    mark: DeliveryMark | undefined,
    sameHub: boolean
  ): boolean {
    const list = this.#kept.get(instanceId) ?? [];
    const took = mark?.epoch === this.epoch ? mark.seq : 0;
    const lost = this.#lost.get(instanceId);
    this.#lost.delete(instanceId);
    const gone = sameHub
      ? Math.max(lost?.handed ?? 0, lost?.unsent ?? 0) > took
      : (lost?.unsent ?? 0) > 0;
    const owed = list.filter((kept) =>
      sameHub ? kept.frame.sent.seq > took : !kept.handed
    );
    for (const kept of list) {
      if (!owed.includes(kept)) {
        this.#bytes -= kept.bytes;
      }
    }
    this.#kept.set(instanceId, owed);
    const [first] = list;
    if (gone && first && !this.#hand(this.#lostFrame(first.frame))) {
      return false;
    }
    for (const kept of owed) {
      kept.handed = this.#hand(kept.frame);
      if (!kept.handed) {
        return false;
      }
    }
    if (owed.length > 0 || gone) {
      this.#log(
        `outbox: ${instanceId.slice(0, 8)}: sent ${owed.length} frame(s) again (${sameHub ? `same hub, it had up to ${took}` : "a hub new to this agent"})${gone ? ", after saying some were lost" : ""}`
      );
    }
    return true;
  }

  /** A heartbeat's ack: what the hub took, let go. */
  acknowledged(delivered: Record<string, DeliveryMark>): void {
    for (const [instanceId, mark] of Object.entries(delivered)) {
      const list = this.#kept.get(instanceId);
      if (!list || mark.epoch !== this.epoch) {
        continue;
      }
      const kept = list.filter(
        (entry) => !(entry.handed && entry.frame.sent.seq <= mark.seq)
      );
      for (const entry of list) {
        if (!kept.includes(entry)) {
          this.#bytes -= entry.bytes;
        }
      }
      this.#kept.set(instanceId, kept);
    }
  }

  /** Whether a session has a frame waiting to be handed. */
  #waiting(instanceId: string): boolean {
    return (this.#kept.get(instanceId) ?? []).some((kept) => !kept.handed);
  }

  /** Hands one frame to the socket; a refusal is the link down. */
  #hand(frame: OutboxFrame): boolean {
    const handed = this.#send(frame);
    if (!handed) {
      this.#ready = false;
    }
    return handed;
  }

  /** Past {@link OUTBOX_BYTES}: the oldest kept frames go, each one's session noting what it lost. */
  #trim(): void {
    while (this.#bytes > OUTBOX_BYTES) {
      let oldest: { instanceId: string; kept: Kept } | undefined;
      for (const [instanceId, list] of this.#kept) {
        const [head] = list;
        if (head && (!oldest || head.order < oldest.kept.order)) {
          oldest = { instanceId, kept: head };
        }
      }
      if (!oldest) {
        return;
      }
      const { instanceId, kept } = oldest;
      this.#kept.get(instanceId)?.shift();
      this.#bytes -= kept.bytes;
      const lost = this.#lost.get(instanceId) ?? { handed: 0, unsent: 0 };
      if (kept.handed) {
        lost.handed = kept.frame.sent.seq;
      } else {
        lost.unsent = kept.frame.sent.seq;
      }
      this.#lost.set(instanceId, lost);
    }
  }

  /** The {@link FRAMES_LOST} line a session is sent ahead of what was kept. */
  #lostFrame(like: OutboxFrame): OutboxFrame {
    const message: NeutralSystemMessage = {
      type: "system",
      subtype: FRAMES_LOST,
      content: `frames this machine could not keep while its link to the hub was down (past ${OUTBOX_BYTES / 1024 / 1024} MiB) were lost`,
    };
    return {
      kind: "frame",
      instanceId: like.instanceId,
      harness: like.harness,
      message,
    };
  }
}
