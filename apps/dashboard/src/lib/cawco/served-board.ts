/**
 * The shapes the board the first paint draws is made of, below both the
 * server's load that builds it (first-paint.ts) and the store that draws from
 * it (stores/board.svelte.ts), so neither imports the other.
 */
import type {
  AgentRow,
  InstanceRow,
  SessionPulse,
  StoredRecent,
} from "@cawco/core/protocol";
import type { FleetFault } from "./convergence";

/** An area as the hub keeps it: projects name theirs by id (`areaId`). */
export interface Area {
  id: string;
  name: string;
  position: number;
}

/** What a machine's row says is wrong with it (machine-verdict.ts). */
export interface MachineVerdict {
  /** Its harness CLIs refused here, each said; null for none. */
  blocked: string | null;
  /** Fleet rows it could not apply: slow while all only timed out; null for none. */
  faults: "sync slow" | "sync failed" | null;
  /** Every harness's sign-in words; null for none. */
  signIn: string | null;
  /** Its sync never landed, failed or went unanswered, in a word or two; null when it converged. */
  sync: string | null;
}

/**
 * A session row's fields the first paint reads: where it is, its kind and
 * status, its titles, its place in its tree, and the stamps Recent orders,
 * groups, ages and marks it by. Every required field of `InstanceRow` is
 * here (the store's `instances` is typed so, and checks it).
 */
export const ROW_KEYS = [
  "id",
  "machineId",
  "projectId",
  "sessionId",
  "harness",
  "cwd",
  "launchDir",
  "kind",
  "origin",
  "status",
  "title",
  "titleSource",
  "derivedTitle",
  "parentInstanceId",
  "continuedInto",
  "createdAt",
  "updatedAt",
  "turnEndedAt",
  "wroteAt",
  "seenAt",
  "doneAt",
  "wakesItself",
  "queuedSends",
  "runningDelegates",
  "stalled",
] as const satisfies readonly (keyof InstanceRow)[];

export type FirstPaintRow = Pick<InstanceRow, (typeof ROW_KEYS)[number]>;

/**
 * A machine's fields the first paint reads: who and where it is, its status
 * and build, its pause, and the faults its row says (its update, its last
 * fleet change, what a workspace there lacks). Not its harnesses, its fleet
 * report or each fleet item's converge, the most of a machine's row: what
 * the first paint reads of those goes as it reads it, made by the page's
 * own functions here: the items that didn't set up as their fault lines
 * read them (`fleetFaults`), and what its row says is wrong with it
 * (`verdict`, the bar's Machines).
 */
export const MACHINE_KEYS = [
  "machineId",
  "hostname",
  "os",
  "status",
  "auth",
  "build",
  "home",
  "hostsHub",
  "lastSeenAt",
  "lostAt",
  "reconnectingUntil",
  "pausedUntil",
  "pauseStopped",
  "binaryUpdate",
  "fleetSync",
  "machineCapabilities",
] as const satisfies readonly (keyof AgentRow)[];

type FirstPaintMachine = Pick<AgentRow, (typeof MACHINE_KEYS)[number]> & {
  /** Its fleet items that didn't set up (convergence.ts `fleetFaults`). */
  fleetFaults: FleetFault[];
  /** What its row says is wrong with it (machine-verdict.ts). */
  verdict: MachineVerdict;
};

/** Recent's stored transcripts, the older sessions among them cut as every row is. */
interface FirstPaintStored extends Omit<StoredRecent, "rows"> {
  rows: FirstPaintRow[];
}

/** The board the first paint draws (first-paint.ts), its projects as the page types them. */
export interface ServedBoard<Project> {
  areas: Area[];
  instances: FirstPaintRow[];
  machines: FirstPaintMachine[];
  projects: Project[];
  pulses: Record<string, SessionPulse>;
  /** Recent's stored transcripts as the hub keeps them, drawn until its first `stored` frame. */
  stored: FirstPaintStored;
}
