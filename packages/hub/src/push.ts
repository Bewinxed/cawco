/**
 * Pushes to the iOS app (Projects spec §5.5, P2): alerts from the hub when
 * something newly needs you. The visible alert is safe text that never says
 * what the work said (App Review 4.5.4); the real words (the session's own
 * title, the question or the permission it asks) ride in the payload's `e`,
 * sealed with AES-256-GCM under the key the device registered, which only
 * that device and this hub hold. The app's notification service extension
 * opens it and shows it in place of the safe alert, so neither Cawrier nor
 * Apple can read it. Its `cawco` data carries the ids the app reads the
 * details by, over the tailnet, once opened.
 *
 * - **Cawrier** (apps/cawrier) holds the app's APNs key; no hub does. A phone
 *   that bought Pro enrolls a pairing there and registers the pairing's id
 *   and secret here, on a hidden route. Each push is one `POST /v1/push` to
 *   Cawrier with that secret. A pairing Cawrier no longer knows (401) or
 *   whose device is gone (410) is deleted; the app registers again on its
 *   next launch. A quiet device stays registered and is sent nothing.
 * - **Moments**: a session asks for permission or asks a question
 *   ({@link Push.onAsk}), a task enters a stage of kind `you`
 *   ({@link Push.taskChanged}), an attempt at a task fails
 *   ({@link Push.itemEnded}). Each item pushes at most once per transition:
 *   an ask once per request, and one collapse id per task, so a failed attempt
 *   that moves its task into a `you` stage is one push, not two.
 * - **Bursts**: the phone gets one notification per moment of attention.
 *   Every item joins the open burst ({@link QUIET_MS}, {@link BURST_MS}),
 *   and as the burst goes out each is asked again whether it still needs
 *   you and whether the gate lets it through. One left goes as itself;
 *   several go as one push under the burst's own collapse id. A burst never
 *   costs a lock-screen answer: while an ask among them is still parked,
 *   the push is the newest such ask's (its words, category and ids, so its
 *   buttons answer it) and "And 5 more need you"; with none, it names the
 *   count and the first ("6 tasks need you") and opens Needs you. An ask
 *   goes at once (a session is blocked on it); a second ask in the burst
 *   replaces it on the device under the burst's id rather than stacking,
 *   and the burst's push replaces both. An answered ask is over: it leaves
 *   the burst, and a push it led is replaced at once, by the same rule,
 *   under a fresh id (the device's word that it acted on the old one then
 *   takes nothing else down). A push that takes another's place
 *   names the one it replaces in `cawco.cleared`, so the device takes it
 *   down and never reports it as the person's dismissal. The burst's id
 *   clears once every item it named has cleared.
 *
 * - **The gate** (notifications.ts): every push about a session is offered
 *   there and dropped when a client had that session in front at any moment
 *   since the item landed, so nothing the owner saw there reaches a device
 *   afterwards. Every visible push carries the
 *   last day's cleared collapse ids (`cawco.cleared`), and each clear queues
 *   one background push per device, at most one per device every
 *   {@link BACKGROUND_GAP_MS}, carrying the whole set: APNs keeps only the
 *   newest background push for a device, and Apple asks for "two or three
 *   per hour".
 *
 * `CAWCO_CAWRIER_ORIGIN` points every push at a stand-in for a local run —
 * the Telegram bridge's `CAWCO_TELEGRAM_API` precedent.
 */
import {
  type Envelope,
  type FleetWatchNotice,
  MEMORY_PROPOSAL_TOOL,
  machineLabel,
  type PermissionRequestFrame,
  PROJECT_SETTINGS_TOOL,
  questionsOf,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { firstLine } from "@cawco/core/tool-presentation";
import { Elysia, t } from "elysia";
import type { DbShape, PushDeviceRow, WorkItemRow } from "./db";
import { hidden } from "./hidden";
import { boardTitle } from "./labels";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  askCollapseId,
  type Notifications,
  needsCollapseId,
  taskCollapseId,
  turnCollapseId,
} from "./notifications";
import type { TaskEvent } from "./tasks";

const CAWRIER = Bun.env.CAWCO_CAWRIER_ORIGIN ?? "https://cawrier.cawco.dev";

/** One push per collapse id inside this window: a task's move and its failed attempt are one moment. */
const SAME_MOMENT_MS = 10_000;
/**
 * A burst stays open this long after its last arrival. An agent moving
 * tasks makes one tool call every few seconds (2026-10-15: six moves to
 * Review in about 25 s, six pushes), so a quiet of two such calls ends it.
 */
const QUIET_MS = 10_000;
/** And at most this long from its first: nothing held waits longer for the owner. */
const BURST_MS = 30_000;
/** How long a burst's push is kept for clearing once every item it named has cleared. */
const COVER_KEPT_MS = 24 * 60 * 60_000;
/** An undelivered push is worth nothing after a day. */
const EXPIRY_S = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;
/** At most one background push per device in this window (Apple: "two or three per hour"). */
const BACKGROUND_GAP_MS = 20 * 60_000;

/**
 * The app's notification categories (the spec in the Projects plan, §5.5,
 * names their actions). A permission whose tool can run anything, or a plan,
 * is opened to be read, never approved or denied from the lock screen; any
 * other permission offers Approve, Deny and "Other…" (a denial in the
 * operator's words). A push about a session (`turn`, `task` with one,
 * `attempt`) offers Reply; a task no session has worked on yet only opens. A
 * question the app can answer inline goes as `question` with its options
 * sealed (`inlineOptions`): the app's notification service extension opens
 * them and gives that one push a category of its own, an action per option
 * and "Other…".
 */
export const PUSH_CATEGORIES = {
  permission: "CAWCO_PERMISSION",
  permissionOpenOnly: "CAWCO_PERMISSION_OPEN",
  question: "CAWCO_QUESTION",
  turn: "CAWCO_TURN",
  task: "CAWCO_TASK",
  taskOpenOnly: "CAWCO_TASK_OPEN",
  attempt: "CAWCO_ATTEMPT",
  needs: "CAWCO_NEEDS",
  test: "CAWCO_TEST",
} as const;

/** A question with more options than this is opened to be answered: three and "Other…" fill the four actions a category shows. */
const MAX_INLINE_OPTIONS = 3;

/**
 * How long a finished turn waits before it pushes, for a dashboard that has
 * the session in front on a visible page to say so: it marks the session
 * looked at as its turn ends (SessionSurface.svelte, `/api/seen` `look`).
 */
const LOOK_GRACE_MS = 5000;
/** A finished turn's visible body: the reply itself goes sealed. */
const TURN_ENDED = "Finished its turn";
/** A memory proposal's visible title (memory.ts): what it is, its project under it. */
const MEMORY_PROPOSAL_NAME = "Memory proposal";
/** A project setting Caw asked about (project-settings.ts): what it is, its project under it. */
const PROJECT_SETTING_NAME = "Project setting";

/** Tools whose approval must be read in full: a push never offers Approve for them. */
const OPEN_ONLY_TOOLS = new Set([
  "Bash",
  "BashOutput",
  "ExitPlanMode",
  "KillShell",
  "Task",
]);

/** What the app reads to find the item, under the payload's `cawco` key. */
export type PushData =
  | {
      kind: "ask";
      instanceId: string;
      machineId: string;
      /**
       * The session whose pane the ask is drawn in when it is not its own
       * (a memory curator run's proposal): a tap opens that session at the
       * card. Null otherwise.
       */
      originInstanceId: string | null;
      projectId: string | null;
      requestId: string;
      /** The Caw thread the ask was made in: a tap opens it at the card. Null otherwise. */
      threadId: string | null;
      workflowRunId: string | null;
    }
  | {
      /** A session the owner started finished its turn and waits on them. */
      kind: "turn";
      instanceId: string;
      machineId: string;
      projectId: string | null;
    }
  | {
      kind: "task";
      /** The session of the task's newest attempt, which Reply writes to; null before any. */
      instanceId: string | null;
      machineId: string | null;
      projectId: string;
      taskId: string;
    }
  | {
      kind: "attempt";
      instanceId: string;
      /** Null when the attempt's session is no longer on the hub. */
      machineId: string | null;
      projectId: string;
      taskId: string;
      workItemId: string;
    }
  | {
      /**
       * A routine's run (routines.ts): failed twice and needs you, or, for a
       * routine in no project (no thread to note it in), delivered. The app
       * opens the board for a kind it does not know.
       */
      kind: "routine";
      /** Its run's session, while the hub holds it; Reply writes to it. */
      instanceId: string | null;
      machineId: string | null;
      projectId: string | null;
      routineId: string;
      runId: string;
    }
  | {
      /**
       * An approved action (actions.ts) waiting for your approval, or whose
       * call may or may not have happened. Opened, never answered from the
       * lock screen: the card shows the exact call. The app opens the board
       * for a kind it does not know.
       */
      kind: "action";
      actionId: string;
      projectId: string;
    }
  | {
      /** Several things need you at once (a burst): opens Needs you. */
      kind: "needs";
      count: number;
    }
  | { kind: "test" };

/** One option of a question answered from the push: its action is `ANSWER_<id>`, `id` its index among the question's options. */
export interface PushOption {
  readonly id: string;
  readonly label: string;
}

/**
 * An alert's words; `subtitle` is the item's project, absent when it is the
 * title. `options` are a question's, sealed with the rest: the agent wrote them.
 */
interface Alert {
  readonly body: string;
  readonly options?: readonly PushOption[];
  readonly subtitle?: string;
  readonly title: string;
}

interface Notification {
  readonly category: string;
  readonly collapseId: string;
  readonly data: PushData;
  /** The real words, sealed for each device into `e`; the app shows them in place of `shown`. */
  readonly sealed: Alert;
  /** The alert Cawrier and Apple see: never what the work said (see `sessionName`). */
  readonly shown: Alert;
  readonly threadId: string;
}

/** What the visible alert says under a name: the status line. */
const NEEDS_YOU = "Needs you";

/** An alert, its project as the subtitle unless it is the title. */
const alertOf = (
  title: string,
  project: string | null,
  body: string = NEEDS_YOU
): Alert =>
  project && project !== title
    ? { title, subtitle: project, body }
    : { title, body };

/** One item that needs you, held in its burst until it goes out. */
interface Arrival {
  /** An ask: a session is blocked on it, so it goes at once. */
  readonly ask: boolean;
  /** The session it is about, for the gate; null when none. */
  readonly instanceId: string | null;
  readonly landedAt: Date;
  readonly notification: Notification;
  /** Still needs you as it goes out: an ask still parked, a task still in a `you` stage, a turn not looked at. */
  readonly still: () => boolean | Promise<boolean>;
}

/** Items that arose close together, from one actor or several: one notification. */
interface Burst {
  readonly firstAt: number;
  /**
   * The collapse id a push naming more than one of its items goes under: a
   * fresh one each time an answered ask's push is replaced, so the device's
   * late word that it acted on the old one never takes the new one down.
   */
  id: string;
  /**
   * By collapse id, in the order they arose: a second arrival under one id
   * (a task's move and its failed attempt) is the same item, newer words.
   */
  readonly items: Map<string, Arrival>;
  /** The ask whose buttons what it shows carries; null when it shows one item alone or nothing to answer. */
  lead: string | null;
  /** How many times its push was replaced after an answer: the next id's suffix. */
  replaced: number;
  /** What the device shows of it: one item's own collapse id, the burst's id, or nothing yet. */
  showing: string | null;
  /** The items what it shows counted, in the order they arose. */
  shown: readonly Arrival[];
  timer?: HubTimer;
}

const idOf = (item: Arrival): string => item.notification.collapseId;

/** What a burst's items are, when they are all one thing: "6 tasks need you". */
const NOUNS: Partial<Record<PushData["kind"], string>> = {
  ask: "asks",
  turn: "sessions",
  task: "tasks",
  attempt: "tasks",
  routine: "routines",
  action: "approved actions",
};

/** An alert that names the first of `count` items: its own title, then how many more. */
const firstOf = (alert: Alert, count: number): string =>
  `${alert.title}, and ${count - 1} more`;

/**
 * One push for several items: the count and what they are, the first
 * item's own name (its safe one shown, its real one sealed) and how many
 * more, its project when they share one. It opens Needs you.
 */
const burstOf = (id: string, items: readonly Arrival[]): Notification => {
  const count = items.length;
  const nouns = new Set(
    items.map((item) => NOUNS[item.notification.data.kind])
  );
  const [noun] = nouns.size === 1 ? [...nouns] : [undefined];
  const title = noun ? `${count} ${noun} need you` : `${count} need you`;
  const projects = new Set(
    items.map((item) => item.notification.shown.subtitle)
  );
  const [project] = projects.size === 1 ? [...projects] : [undefined];
  const first = items[0].notification;
  return {
    shown: alertOf(title, project ?? null, firstOf(first.shown, count)),
    sealed: alertOf(title, project ?? null, firstOf(first.sealed, count)),
    category: PUSH_CATEGORIES.needs,
    collapseId: id,
    threadId: "needs",
    data: { kind: "needs", count },
  };
};

/**
 * Several items led by an ask still parked: the ask's own words first, its
 * category and data, so its buttons answer it from the lock screen, then
 * how many more need you.
 */
const askAmong = (
  id: string,
  ask: Notification,
  count: number
): Notification => {
  const more = `And ${count - 1} more need you`;
  return {
    ...ask,
    collapseId: id,
    shown: { ...ask.shown, body: `${ask.shown.body}\n${more}` },
    sealed: { ...ask.sealed, body: `${ask.sealed.body}\n${more}` },
  };
};

/**
 * What a burst sends for `items` (each still needing you): one item as
 * itself; several under the burst's id, led by the newest ask among them
 * so a burst never costs a lock-screen answer, else Open only as the burst.
 * `lead` is the ask whose buttons it carries.
 */
const pushOf = (
  id: string,
  items: readonly Arrival[]
): { lead: string | null; notification: Notification } => {
  const [first] = items;
  if (items.length === 1) {
    return { lead: null, notification: first.notification };
  }
  const ask = items.findLast((item) => item.ask);
  return ask
    ? {
        lead: idOf(ask),
        notification: askAmong(id, ask.notification, items.length),
      }
    : { lead: null, notification: burstOf(id, items) };
};

/** Cawrier refuses a payload over APNs' 4096 bytes (apps/cawrier `MAX_PAYLOAD_BYTES`). */
const MAX_PAYLOAD_BYTES = 4096;
/** AES-GCM's IV and tag around the ciphertext: CryptoKit's `SealedBox.combined`. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** A device's push key: 32 random bytes, standard base64 with padding. */
const KEY = /^[A-Za-z0-9+/]{43}=$/;

const utf8 = new TextEncoder();
/** The sealed alert's UTF-8 JSON, as WebCrypto takes it. */
type Plaintext = Uint8Array<ArrayBuffer>;
const byteLength = (text: string): number => utf8.encode(text).length;

/**
 * The payload APNs gets, `e` the sealed alert in base64, `cawco.cleared` the
 * collapse ids the device takes down as it shows this one.
 */
const payloadOf = (
  notification: Notification,
  e: string,
  cleared: readonly string[]
) => ({
  aps: {
    alert: notification.shown,
    sound: "default",
    category: notification.category,
    "thread-id": notification.threadId,
    "mutable-content": 1,
  },
  e,
  cawco: { ...notification.data, cleared },
});

/**
 * The longest cut of `text` (whole code points, then "…") that `fits`, or
 * undefined when not even "…" does. Bytes grow with every code point kept,
 * so the longest is found by halving.
 */
const longestCut = (
  text: string,
  fits: (cut: string) => boolean
): string | undefined => {
  const points = Array.from(text);
  const cutAt = (kept: number) => `${points.slice(0, kept).join("")}…`;
  if (!fits(cutAt(0))) {
    return undefined;
  }
  let fitting = 0;
  let over = points.length;
  while (over - fitting > 1) {
    const middle = Math.floor((fitting + over) / 2);
    if (fits(cutAt(middle))) {
      fitting = middle;
    } else {
      over = middle;
    }
  }
  return cutAt(fitting);
};

/**
 * The sealed alert's plaintext, `{"v":1,…}` as UTF-8, cut to fit the payload:
 * the body first, then the title; the visible alert and a question's options
 * are never cut. Its sealed size is the same for every device, so it is
 * fitted once per push.
 */
const plaintextOf = (
  notification: Notification,
  cleared: readonly string[]
): Plaintext => {
  const room =
    MAX_PAYLOAD_BYTES -
    byteLength(JSON.stringify(payloadOf(notification, "", cleared)));
  // Base64 writes each 3 bytes as 4 characters, padded to a whole 4.
  const limit = Math.floor(room / 4) * 3 - IV_BYTES - TAG_BYTES;
  const { subtitle, options } = notification.sealed;
  const encode = (title: string, body: string): Plaintext =>
    utf8.encode(
      JSON.stringify({
        v: 1,
        title,
        ...(subtitle ? { subtitle } : {}),
        body,
        ...(options ? { options } : {}),
      })
    );
  const fits = (title: string, body: string) =>
    encode(title, body).length <= limit;
  const whole = notification.sealed;
  if (fits(whole.title, whole.body)) {
    return encode(whole.title, whole.body);
  }
  const shorterBody = longestCut(whole.body, (cut) => fits(whole.title, cut));
  if (shorterBody !== undefined) {
    return encode(whole.title, shorterBody);
  }
  const shorterTitle = longestCut(whole.title, (cut) => fits(cut, "…"));
  if (shorterTitle === undefined) {
    throw new Error("The visible alert alone fills the push.");
  }
  return encode(shorterTitle, "…");
};

/** AES-256-GCM under the device's key: `IV ‖ ciphertext ‖ tag`, base64. */
const seal = async (key: string, plaintext: Plaintext): Promise<string> => {
  const sealer = await crypto.subtle.importKey(
    "raw",
    Buffer.from(key, "base64"),
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_BYTES * 8 },
    sealer,
    plaintext
  );
  return Buffer.concat([iv, new Uint8Array(sealed)]).toString("base64");
};

/** One device's answer from Cawrier. */
export interface PushOutcome {
  readonly name: string;
  /** The pairing is gone (401 or 410) and the device with it. */
  readonly pruned: boolean;
  readonly reason: string | null;
  /** HTTP status, or 0 when Cawrier could not be reached. */
  readonly status: number;
}

export interface PushServices {
  readonly db: DbShape;
  readonly lifetime: HubLifetimeShape;
  /** The one gate every push about a session goes through. */
  readonly notifications: Notifications;
  /** A task as a read shows it; undefined when it cannot be read. */
  readonly task: (
    projectId: string,
    taskId: string
  ) => Promise<{ kind: string | null; title: string } | undefined>;
}

/** Each harness as the operator knows it; a row without one is Claude Code. */
const HARNESS_NAMES: Record<string, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  pi: "pi",
};

/** Which category an ask goes as: a question, a permission to open, or one Approve may answer. */
const askCategory = (
  payload: Partial<PermissionRequestFrame>
): (typeof PUSH_CATEGORIES)[keyof typeof PUSH_CATEGORIES] => {
  const tool = payload.toolName ?? "";
  if (payload.requestKind === "question" || tool === "AskUserQuestion") {
    return PUSH_CATEGORIES.question;
  }
  return OPEN_ONLY_TOOLS.has(tool) || tool.startsWith("mcp__")
    ? PUSH_CATEGORIES.permissionOpenOnly
    : PUSH_CATEGORIES.permission;
};

/**
 * The options a question push answers with, or undefined when it is opened
 * to be answered: a session's AskUserQuestion (core `questionsOf`, the
 * reading the app's card and the dashboard share) of one single-choice
 * question with one to {@link MAX_INLINE_OPTIONS} options. Several questions,
 * a multi-select (one tap can't say several picks), more options, or a
 * workflow run's question (answered on its run's page) stay Open only.
 */
const inlineOptions = (
  payload: Partial<PermissionRequestFrame> & { workflowRunId?: string },
  instanceId: string
): PushOption[] | undefined => {
  if (!instanceId || payload.workflowRunId) {
    return undefined;
  }
  const questions = questionsOf(payload.toolName ?? "", payload.input ?? {});
  const options =
    questions?.length === 1 && !questions[0].multiSelect
      ? questions[0].options
      : [];
  if (options.length === 0 || options.length > MAX_INLINE_OPTIONS) {
    return undefined;
  }
  return options.map((option, index) => ({
    id: String(index),
    label: option.label,
  }));
};

/**
 * What one push asks of Cawrier beside the pairing: a visible alert under its
 * collapse id, or a background push (`apns-push-type: background`, priority
 * 5) that carries only data.
 */
type PushBody =
  | { collapseId: string; payload: Record<string, unknown> }
  | { pushType: "background"; payload: Record<string, unknown> };

/**
 * One POST to Cawrier for this device, its body made here (a visible alert
 * is sealed per device); never throws. `reason` is Cawrier's sentence, or
 * APNs' reason it passed on.
 */
const post = async (
  device: PushDeviceRow,
  body: () => Promise<PushBody>
): Promise<{ status: number; reason: string | null }> => {
  try {
    const response = await fetch(`${CAWRIER}/v1/push`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${device.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        pairingId: device.pairingId,
        expiration: Math.floor(Date.now() / 1000) + EXPIRY_S,
        ...(await body()),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      return { status: response.status, reason: null };
    }
    const answer = (await response.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
    };
    return {
      status: response.status,
      reason: answer.reason ?? answer.error ?? null,
    };
  } catch {
    return { status: 0, reason: null };
  }
};

/**
 * Removes a device: Cawrier wipes its pairing first, which frees the
 * purchase's seat, then the hub forgets it. When Cawrier does not take it,
 * the hub still forgets the device and logs why; the seat then frees itself
 * at the pairing's alarm. False when no device has that pairing.
 */
const removeDevice = async (
  db: DbShape,
  pairingId: string
): Promise<boolean> => {
  const device = db.push.devices().find((row) => row.pairingId === pairingId);
  if (!device) {
    return false;
  }
  let refusal: string | undefined;
  try {
    const response = await fetch(`${CAWRIER}/v1/unenroll`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${device.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ pairingId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status !== 204) {
      const answer = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      refusal = `Cawrier answered ${response.status} ${answer.error ?? ""}`;
    }
  } catch (error) {
    refusal = `Cawrier not reached: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (refusal) {
    console.warn(
      `[push] ${device.name}: unenroll — ${refusal}; removed here, its seat frees at the pairing's alarm`
    );
  }
  return db.push.dropDevice(pairingId);
};

export const createPush = ({
  db,
  lifetime,
  notifications,
  task,
}: PushServices) => {
  /** Asks already pushed, by request id: a replayed or re-escalated ask is not a new moment. */
  const asked = new Set<string>();
  /** When each collapse id last went out. */
  const recent = new Map<string, number>();
  /** Sessions whose running turn the operator interrupted: its end pushes nothing. */
  const stopped = new Set<string>();
  /** By pairing: the clear count the device was last handed the whole cleared set at. */
  const told = new Map<string, number>();
  /** By pairing: when its last background push went. */
  const backgroundAt = new Map<string, number>();
  /** By pairing: the background push waiting out its gap. */
  const queued = new Map<string, HubTimer>();

  /** Records what Cawrier said for a device: taken, pairing gone (the device goes) or refused. */
  const settle = (
    device: PushDeviceRow,
    status: number,
    reason: string | null
  ): boolean => {
    if (status === 200) {
      db.push.noteResult(device.pairingId, null);
      return false;
    }
    const pruned =
      (status === 401 || status === 410) &&
      db.push.dropDevice(device.pairingId);
    if (!pruned) {
      db.push.noteResult(
        device.pairingId,
        reason ??
          (status ? `Cawrier answered ${status}` : "Cawrier not reached")
      );
    }
    console.warn(
      `[push] ${device.name}: ${status} ${reason ?? ""}${pruned ? " — pairing gone, removed" : ""}`
    );
    return pruned;
  };

  const awake = (): PushDeviceRow[] =>
    db.push.devices().filter((device) => !device.quiet);

  /**
   * Sends one notification to every device that is not quiet (or to the ones
   * given), carrying the cleared ids: a device that takes it has been handed
   * every clear so far. `replacing` are the ids of what it takes the place
   * of, carried with them: the device takes those down as the hub's doing.
   */
  const deliver = async (
    notification: Notification,
    to?: PushDeviceRow[],
    replacing: readonly string[] = []
  ): Promise<PushOutcome[]> => {
    const devices = to ?? awake();
    const count = notifications.clearCount();
    const cleared = [...new Set([...replacing, ...notifications.carried()])];
    const plaintext = plaintextOf(notification, cleared);
    return await Promise.all(
      devices.map(async (device): Promise<PushOutcome> => {
        const { status, reason } = await post(device, async () => ({
          collapseId: notification.collapseId,
          payload: payloadOf(
            notification,
            await seal(device.key, plaintext),
            cleared
          ),
        }));
        const pruned = settle(device, status, reason);
        if (status === 200) {
          told.set(device.pairingId, count);
        }
        return { name: device.name, status, reason, pruned };
      })
    );
  };

  /** Sends now; a push already shown under its collapse id is replaced by it (`apns-collapse-id`). */
  const replace = (
    notification: Notification,
    replacing: readonly string[] = []
  ): void => {
    if (awake().length > 0) {
      notifications.shown(notification.collapseId);
    }
    deliver(notification, undefined, replacing).catch((error: unknown) =>
      console.warn(
        `[push] ${notification.collapseId}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /** The burst items arrive into, while it is open. */
  let open: Burst | undefined;
  /**
   * By the collapse id of a burst's push that named several items: its
   * burst, and the items not cleared yet. When the last clears, so does
   * the burst's push.
   */
  const covers = new Map<
    string,
    { at: number; burst: Burst; outstanding: Set<string> }
  >();

  notifications.onCleared((ids, via) => {
    const now = Date.now();
    for (const [id, cover] of covers) {
      if (ids.includes(id) || now - cover.at > COVER_KEPT_MS) {
        covers.delete(id);
        continue;
      }
      for (const item of ids) {
        cover.outstanding.delete(item);
      }
      if (cover.outstanding.size === 0) {
        covers.delete(id);
        notifications.clear([id], via);
      }
    }
  });

  /**
   * Sends `items` for `burst` (one as itself, several under `id`, led by
   * the newest ask among them: `pushOf`), in place of whatever the burst
   * showed before, which the push names in `cawco.cleared` so the device
   * takes it down.
   */
  const send = (burst: Burst, items: readonly Arrival[], id: string): void => {
    const { lead, notification } = pushOf(id, items);
    const replacing =
      burst.showing && burst.showing !== notification.collapseId
        ? [burst.showing]
        : [];
    if (burst.showing) {
      covers.delete(burst.showing);
    }
    const now = Date.now();
    const ids = items.map(idOf);
    for (const one of ids) {
      recent.set(one, now);
    }
    if (items.length > 1) {
      // Each item is outstanding under its own id too: its clear (an ask
      // settled, a session looked at) reaches `covers`.
      for (const one of ids) {
        notifications.shown(one);
      }
      covers.set(notification.collapseId, {
        at: now,
        burst,
        outstanding: new Set(ids),
      });
    }
    burst.showing = notification.collapseId;
    burst.shown = items;
    burst.lead = lead;
    console.log(
      `[notify] push ${notification.collapseId}: ${items.length === 1 ? "sent" : `${items.length} in one (${ids.join(", ")})${lead ? `, led by ${lead}` : ""}`}${replacing.length > 0 ? `, replacing ${replacing.join(", ")}` : ""}`
    );
    replace(notification, replacing);
  };

  /** Shows what of `burst` still needs you, unless the device already shows all of it. */
  const show = (burst: Burst, items: readonly Arrival[]): void => {
    const shown = new Set(burst.shown.map(idOf));
    if (items.every((item) => shown.has(idOf(item)))) {
      return;
    }
    send(burst, items, burst.id);
  };

  /** An item the device was shown that still needs you: an ask still parked, anything else not cleared. */
  const stillShown = (item: Arrival, outstanding: ReadonlySet<string>) =>
    item.notification.data.kind === "ask"
      ? asked.has(item.notification.data.requestId)
      : outstanding.has(idOf(item));

  /**
   * An ask was answered (or otherwise settled): it is over, and leaves the
   * open burst at once. A burst push it led (its buttons) is replaced at
   * once by what is left, under a fresh id and by the same rule: led by the
   * newest ask still parked, else Open only, or the last item as itself;
   * with nothing left it comes down.
   */
  const answered = (requestId: string): void => {
    const id = askCollapseId(requestId);
    open?.items.delete(id);
    const [shownId, cover] =
      [...covers].find(([, one]) => one.burst.lead === id) ?? [];
    if (!(shownId && cover)) {
      return;
    }
    const { burst } = cover;
    const rest = burst.shown.filter(
      (item) => idOf(item) !== id && stillShown(item, cover.outstanding)
    );
    if (rest.length === 0) {
      covers.delete(shownId);
      burst.showing = null;
      burst.shown = [];
      burst.lead = null;
      notifications.clear([shownId], "settled");
      return;
    }
    burst.replaced += 1;
    burst.id = `${needsCollapseId(burst.firstAt)}-${burst.replaced}`;
    console.log(
      `[notify] push ${shownId}: ${id} was answered, replaced by what is left`
    );
    send(burst, rest, burst.id);
  };

  /**
   * Asks each item of `burst` (only its asks when `ask` is the one that just
   * arrived) whether it still needs you, and each the device doesn't show
   * yet whether the gate lets it through; what fails either leaves the
   * burst for good. Then shows what is left.
   */
  const goOut = async (burst: Burst, ask: Arrival | null): Promise<void> => {
    const entries = [...burst.items].filter(([, item]) => !ask || item.ask);
    const still = await Promise.all(
      entries.map(([, item]) =>
        Promise.resolve()
          .then(item.still)
          .catch(() => true)
      )
    );
    const shown = new Set(burst.shown.map(idOf));
    const live: Arrival[] = [];
    for (const [index, [id, item]] of entries.entries()) {
      if (burst.items.get(id) !== item) {
        continue;
      }
      const over = !still[index];
      if (over) {
        console.log(
          `[notify] push ${id}: over before ${burst.id} went out, not counted`
        );
      }
      const passes =
        over ||
        shown.has(id) ||
        notifications.passes({
          outlet: "push",
          collapseId: id,
          instanceId: item.instanceId,
          landedAt: item.landedAt.getTime(),
        });
      if (over || !passes) {
        burst.items.delete(id);
        continue;
      }
      live.push(item);
    }
    if (ask && !live.includes(ask)) {
      return;
    }
    if (live.length > 0) {
      show(burst, live);
    }
  };

  /**
   * An item that needs you joins the open burst, or opens one; the burst
   * goes out {@link QUIET_MS} after its last arrival, at most
   * {@link BURST_MS} after its first. An ask goes out at once. With `once`,
   * an item whose collapse id went out a moment ago is that moment: a failed
   * attempt that moves its task into a `you` stage reaches here twice, as
   * the task and as the attempt. A push whose every send is news (a
   * session's finished turn) arrives without it.
   */
  const arrive = (item: Arrival, once = true): void => {
    const { collapseId } = item.notification;
    const now = Date.now();
    for (const [id, at] of recent) {
      if (now - at > SAME_MOMENT_MS) {
        recent.delete(id);
      }
    }
    if (once && recent.has(collapseId)) {
      return;
    }
    const burst: Burst = open ?? {
      id: needsCollapseId(now),
      firstAt: now,
      items: new Map(),
      lead: null,
      replaced: 0,
      showing: null,
      shown: [],
    };
    open = burst;
    burst.items.set(collapseId, item);
    if (!item.ask) {
      console.log(`[notify] push ${collapseId}: held for ${burst.id}`);
    }
    lifetime.cancel(burst.timer);
    burst.timer = lifetime.after(
      Math.min(QUIET_MS, burst.firstAt + BURST_MS - now),
      () => {
        if (open === burst) {
          open = undefined;
        }
        detach(goOut(burst, null), "needs-you push");
      }
    );
    if (item.ask) {
      detach(goOut(burst, item), "ask push");
    }
  };

  /** Nobody has looked at the session since `at`: what it pushed about then still needs you. */
  const unseenSince = (instanceId: string, at: Date): boolean => {
    const [row] = db.getInstancesByIds([instanceId]);
    return !(row?.seenAt && row.seenAt.getTime() >= at.getTime());
  };

  /**
   * One background push to a device, carrying the whole cleared set, when it
   * has clears it was not handed yet (a visible push since hands them too).
   */
  const background = async (pairingId: string): Promise<void> => {
    const device = awake().find((row) => row.pairingId === pairingId);
    const count = notifications.clearCount();
    if (!device || (told.get(pairingId) ?? 0) >= count) {
      return;
    }
    const cleared = notifications.carried();
    if (cleared.length === 0) {
      return;
    }
    backgroundAt.set(pairingId, Date.now());
    const { status, reason } = await post(device, async () => ({
      pushType: "background",
      payload: { aps: { "content-available": 1 }, cawco: { cleared } },
    }));
    settle(device, status, reason);
    if (status === 200) {
      told.set(pairingId, count);
    }
  };

  /** Ids cleared: each awake device gets a background push now, or when its gap since the last is out. */
  notifications.onCleared(() => {
    const now = Date.now();
    for (const { pairingId } of awake()) {
      if (queued.has(pairingId)) {
        continue;
      }
      const wait = Math.max(
        0,
        (backgroundAt.get(pairingId) ?? 0) + BACKGROUND_GAP_MS - now
      );
      queued.set(
        pairingId,
        lifetime.after(wait, () => {
          queued.delete(pairingId);
          detach(background(pairingId), "background push");
        })
      );
    }
  });

  const projectName = (projectId: string | null | undefined): string | null =>
    (projectId ? db.project(projectId)?.name : undefined) ?? null;

  /**
   * A visible push title crosses Cawrier and APNs and shows on a lock screen
   * (App Review 4.5.4), so it never carries what the work said: not the title
   * a session's first message gave it, not a title the agent gave itself, not
   * its folder. Only a name the owner gave it, else "<harness> on <machine>".
   * The real title goes sealed.
   */
  const sessionName = (instanceId: string): string | undefined => {
    const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    if (!row) {
      return undefined;
    }
    const owned = row.titleSource === "owner" ? row.title?.trim() : undefined;
    if (owned) {
      return owned;
    }
    const harness = HARNESS_NAMES[row.harness ?? "claude"] ?? row.harness;
    const host = db
      .listAgents()
      .find((agent) => agent.machineId === row.machineId)?.hostname;
    return host ? `${harness} on ${machineLabel(host)}` : harness;
  };

  /** An ask's visible name: the owner's title for its session, its workflow's name, else {@link sessionName}. */
  const askName = (
    row: { title: string | null; titleSource: string | null } | undefined,
    workflowRunId: string | undefined,
    instanceId: string
  ): string => {
    const owned = row?.titleSource === "owner" ? row.title?.trim() : undefined;
    const run = workflowRunId ? db.getWorkflowRun(workflowRunId) : undefined;
    return (
      owned ||
      (run ? db.getWorkflow(run.workflowId)?.name : undefined) ||
      sessionName(instanceId) ||
      "A session"
    );
  };

  /**
   * An ask's visible title: a memory proposal and a project setting by what
   * they are ("Memory proposal", "Project setting"), never by what they say;
   * any other by its session or workflow ({@link askName}).
   */
  const askTitle = (
    row: { title: string | null; titleSource: string | null } | undefined,
    payload: Partial<PermissionRequestFrame> & { workflowRunId?: string },
    instanceId: string
  ): string => {
    if (payload.toolName === MEMORY_PROPOSAL_TOOL) {
      return MEMORY_PROPOSAL_NAME;
    }
    if (payload.toolName === PROJECT_SETTINGS_TOOL) {
      return PROJECT_SETTING_NAME;
    }
    return askName(row, payload.workflowRunId, instanceId);
  };

  return {
    /**
     * A session (or a workflow) is blocked on you: a permission or a question.
     * Call wherever the ask reaches the operator (beside the Telegram
     * bridge's `onAsk`); a request is pushed once however often it is called.
     */
    onAsk(envelope: Envelope): void {
      const payload = envelope.payload as Partial<PermissionRequestFrame> & {
        /** An ask no session row stands behind names its project itself (a memory proposal, memory.ts). */
        projectId?: string;
        routedTo?: string;
        workflowRunId?: string;
      };
      const requestId = envelope.requestId ?? payload.requestId;
      if (
        payload.kind !== "permission_request" ||
        !requestId ||
        payload.routedTo === "parent" ||
        asked.has(requestId)
      ) {
        return;
      }
      asked.add(requestId);
      const instanceId = envelope.instanceId ?? payload.instanceId ?? "";
      const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
      // An ask with no session row (a memory proposal) is its project's.
      const projectId = row?.projectId ?? payload.projectId ?? null;
      const project = projectName(projectId);
      // The ask's presentation, stamped as it parked (ask-presentation.ts):
      // the session as the board names it, and the needs-you card's line.
      const { asker, summary } = (payload as PermissionRequestFrame)
        .presentation;
      const options = inlineOptions(payload, instanceId);
      arrive({
        ask: true,
        instanceId: instanceId || null,
        landedAt: new Date(),
        still: () => asked.has(requestId),
        notification: {
          shown: alertOf(
            // A proposal and a project setting are named by what they are,
            // never by what they say.
            askTitle(row, payload, instanceId),
            project
          ),
          sealed: {
            ...alertOf(asker, project, summary),
            ...(options ? { options } : {}),
          },
          category: askCategory(payload),
          collapseId: askCollapseId(requestId),
          threadId: projectId ?? instanceId,
          data: {
            kind: "ask",
            instanceId,
            machineId: envelope.machineId,
            originInstanceId: payload.originInstanceId ?? null,
            projectId,
            requestId,
            threadId: payload.threadId ?? null,
            workflowRunId: payload.workflowRunId ?? null,
          },
        },
      });
    },

    /** An ask left the pending list: a later ask can never reuse its id, so its mark goes. */
    onSettled(requestId: string): void {
      asked.delete(requestId);
      answered(requestId);
    },

    /** A turn of the session is under way: a stop asked before it is not this turn's. */
    turnBegan(instanceId: string): void {
      stopped.delete(instanceId);
    },

    /** The operator (or a session for them) interrupted the session: the turn it cuts pushes nothing. */
    interrupted(instanceId: string): void {
      stopped.add(instanceId);
    },

    /**
     * A session's turn ended with its result, and no standing instruction
     * answered it (server.ts, at the turn's end; a turn cut by a restart has
     * no result and never comes here). Pushes when the session is one the
     * owner started: top level, not a delegate, a workflow's step, a
     * project's lead or a continuation's worker; and not stopped by them.
     * It waits {@link LOOK_GRACE_MS} first: a dashboard or an app that
     * opens the session marks it looked at (`/api/seen` `look`), and then
     * nothing goes. Then it joins the burst, which drops it if the session
     * was looked at meanwhile or the gate finds a client had it in front at
     * any moment since the turn ended. One collapse id per session, never
     * deduplicated: a newer turn's push replaces the older on the device
     * however soon after it comes.
     */
    turnEnded(
      instanceId: string,
      reply: string | undefined,
      endedAt: Date
    ): void {
      if (stopped.delete(instanceId)) {
        return;
      }
      lifetime.after(LOOK_GRACE_MS, () => {
        const [row] = db.getInstancesByIds([instanceId]);
        if (
          !row ||
          row.parentInstanceId ||
          row.workflowStepId ||
          row.workItemId ||
          row.kind === "summariser" ||
          row.role === "lead" ||
          !unseenSince(instanceId, endedAt)
        ) {
          return;
        }
        const project = projectName(row.projectId);
        arrive(
          {
            ask: false,
            instanceId,
            landedAt: endedAt,
            still: () => unseenSince(instanceId, endedAt),
            notification: {
              shown: alertOf(
                sessionName(instanceId) ?? "A session",
                project,
                TURN_ENDED
              ),
              sealed: alertOf(
                boardTitle(row),
                project,
                firstLine(reply) ?? TURN_ENDED
              ),
              category: PUSH_CATEGORIES.turn,
              collapseId: turnCollapseId(instanceId),
              threadId: row.projectId ?? instanceId,
              data: {
                kind: "turn",
                instanceId,
                machineId: row.machineId,
                projectId: row.projectId ?? null,
              },
            },
          },
          false
        );
      });
    },

    /**
     * A task changed (tasks.ts `listen`). Pushes when it entered a stage of
     * kind `you` by anyone but you.
     */
    taskChanged(event: TaskEvent): void {
      if (event.kind === "changed" || event.actor.mover === "you") {
        return;
      }
      const { projectId, id } = event;
      const at = new Date();
      task(projectId, id)
        .then((view) => {
          if (view?.kind !== "you") {
            return;
          }
          const alert = alertOf(view.title, projectName(projectId));
          // The newest attempt's session, still on the hub: Reply writes to it.
          const attempt = db
            .projectAttempts(projectId)
            .find((item) => item.taskId === id);
          const [row] = attempt
            ? db.getInstancesByIds([attempt.instanceId])
            : [];
          arrive({
            ask: false,
            instanceId: row?.id ?? null,
            landedAt: at,
            // Moved on (or back) before the burst went out: not counted.
            still: async () => (await task(projectId, id))?.kind === "you",
            notification: {
              shown: alert,
              sealed: alert,
              category: row
                ? PUSH_CATEGORIES.task
                : PUSH_CATEGORIES.taskOpenOnly,
              collapseId: taskCollapseId(projectId, id),
              threadId: projectId,
              data: {
                kind: "task",
                instanceId: row?.id ?? null,
                machineId: row?.machineId ?? null,
                projectId,
                taskId: id,
              },
            },
          });
        })
        .catch(() => undefined);
    },

    /**
     * A work item ended (work-items.ts `itemEnded`). An attempt at a task that
     * failed leaves the task waiting for you; a plain delegate's failure goes
     * to its parent session, not to you. Named by its task's title, which the
     * owner wrote; an item's own title is the delegating agent's words.
     */
    itemEnded(item: WorkItemRow): void {
      const { taskId, projectId } = item;
      if (item.state !== "failed" || !taskId || !projectId) {
        return;
      }
      const at = new Date();
      const alerted = task(projectId, taskId)
        .catch(() => undefined)
        .then((view) => {
          const project = projectName(projectId);
          const [row] = db.getInstancesByIds([item.instanceId]);
          arrive({
            ask: false,
            instanceId: row ? item.instanceId : null,
            landedAt: at,
            still: () => true,
            notification: {
              shown: alertOf(
                view?.title || sessionName(item.instanceId) || "A task",
                project
              ),
              sealed: alertOf(
                view?.title || (row ? boardTitle(row) : "A task"),
                project
              ),
              category: PUSH_CATEGORIES.attempt,
              collapseId: taskCollapseId(projectId, taskId),
              threadId: projectId,
              data: {
                kind: "attempt",
                instanceId: item.instanceId,
                machineId: row?.machineId ?? null,
                projectId,
                taskId,
                workItemId: item.id,
              },
            },
          });
        });
      detach(alerted, "attempt push");
    },

    /**
     * A routine's run you should hear of (routines.ts): `failed`, its retry
     * failed too and it needs you; else a routine in no project delivered
     * words, which go sealed. Named by the routine's name, which its maker
     * gave it, so it goes sealed too; the visible title is "Routine".
     */
    routine(run: {
      failed: boolean;
      instanceId: string | null;
      name: string;
      output: string | null;
      projectId: string | null;
      routineId: string;
      runId: string;
    }): void {
      const [row] = run.instanceId
        ? db.getInstancesByIds([run.instanceId])
        : [];
      const project = projectName(run.projectId);
      const body = run.failed ? NEEDS_YOU : "Delivered";
      arrive({
        ask: false,
        instanceId: row?.id ?? null,
        landedAt: new Date(),
        still: () => true,
        notification: {
          shown: alertOf("Routine", project, body),
          sealed: alertOf(
            run.name,
            project,
            run.failed ? NEEDS_YOU : firstLine(run.output ?? "") || body
          ),
          category: row
            ? PUSH_CATEGORIES.attempt
            : PUSH_CATEGORIES.taskOpenOnly,
          collapseId: `routine-${run.routineId}`,
          threadId: run.projectId ?? `routine-${run.routineId}`,
          data: {
            kind: "routine",
            instanceId: row?.id ?? null,
            machineId: row?.machineId ?? null,
            projectId: run.projectId,
            routineId: run.routineId,
            runId: run.runId,
          },
        },
      });
      console.log(
        `[push] routine ${run.routineId} run ${run.runId}: ${run.failed ? "needs you" : "delivered"}`
      );
    },

    /**
     * Fleet watch tells you about a session (fleet-watch.ts): a triage said
     * so, or its project's Caw is off. The session push's shape (opens the
     * session, Reply writes to it); the visible words say "Fleet watch" and
     * "Needs you", the sealed ones the session and what was noticed.
     */
    watchNotice(notice: FleetWatchNotice): void {
      const [row] = db.getInstancesByIds([notice.instanceId]);
      const project = projectName(notice.projectId);
      arrive({
        ask: false,
        instanceId: notice.instanceId,
        landedAt: new Date(),
        still: () => true,
        notification: {
          shown: alertOf("Fleet watch", project, NEEDS_YOU),
          sealed: alertOf(
            row ? boardTitle(row) : "A session",
            project,
            firstLine(notice.title)
          ),
          category: PUSH_CATEGORIES.turn,
          collapseId: `watch-${notice.instanceId}`,
          threadId: notice.projectId ?? notice.instanceId,
          data: {
            kind: "turn",
            instanceId: notice.instanceId,
            machineId: notice.machineId,
            projectId: notice.projectId,
          },
        },
      });
      console.log(`[push] fleet watch ${notice.instanceId}: needs you`);
    },

    /**
     * An approved action needs you (actions.ts): it waits for your approval,
     * it failed, or its call may or may not have happened. The permission
     * push's shape, Open only; the visible words say "Approved action" and
     * the state, the sealed ones the connection and `said` (the proposer's
     * reason, or why it failed).
     */
    action(action: {
      connection: string;
      id: string;
      projectId: string;
      said: string;
      state: "proposed" | "failed" | "unknown";
    }): void {
      const project = projectName(action.projectId);
      const { body, ask } = {
        proposed: { body: NEEDS_YOU, ask: "approve?" },
        failed: { body: "Failed", ask: "it failed" },
        unknown: { body: "May or may not have run", ask: "check it" },
      }[action.state];
      arrive({
        ask: false,
        instanceId: null,
        landedAt: new Date(),
        still: () => true,
        notification: {
          shown: alertOf("Approved action", project, body),
          sealed: alertOf(
            `${action.connection}: ${ask}`,
            project,
            firstLine(action.said) || body
          ),
          category: PUSH_CATEGORIES.permissionOpenOnly,
          collapseId: `action-${action.id}`,
          threadId: action.projectId,
          data: {
            kind: "action",
            actionId: action.id,
            projectId: action.projectId,
          },
        },
      });
      console.log(`[push] action ${action.id}: ${action.state}`);
    },

    /** A test: a push to the devices given, quiet ones too. */
    async test(devices: PushDeviceRow[]): Promise<{ outcomes: PushOutcome[] }> {
      return {
        outcomes: await deliver(
          {
            shown: alertOf(
              "Test from Caw",
              null,
              "Notifications work. When an agent needs you, it arrives like this."
            ),
            sealed: alertOf(
              "Test from Caw",
              null,
              "Notifications work, end to end encrypted. When an agent needs you, it arrives like this."
            ),
            category: PUSH_CATEGORIES.test,
            collapseId: "test",
            threadId: "test",
            data: { kind: "test" },
          },
          devices
        ),
      };
    },
  };
};

export type Push = ReturnType<typeof createPush>;

/** What Settings shows of a device; the secret never leaves the hub but for Cawrier, the key never. */
const deviceView = (device: PushDeviceRow) => ({
  id: device.pairingId,
  name: device.name,
  platform: device.platform,
  quiet: device.quiet,
  registeredAt: device.createdAt.getTime(),
  lastSentAt: device.lastSentAt?.getTime() ?? null,
  lastError: device.lastError,
});

/** A pairing id as the app mints it: a lowercase v4 uuid. */
const PAIRING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** A pairing secret: 32 random bytes, base64url without padding. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export const pushRoutes = (db: DbShape, push: Push) =>
  new Elysia()
    // ── Settings: the devices and the test ───────────────────────────────
    .get("/api/push", () => ({ devices: db.push.devices().map(deviceView) }))
    // A test to one device, or without a pairing id to every registered
    // device. Elysia hands an absent body over as `{}`.
    .post(
      "/api/push/test",
      { body: t.Optional(t.Object({ pairingId: t.Optional(t.String()) })) },
      async ({ body, status }) => {
        const devices = db.push.devices();
        const pairingId = body?.pairingId;
        if (pairingId !== undefined) {
          const device = devices.find((row) => row.pairingId === pairingId);
          return device
            ? await push.test([device])
            : status(404, "That device is no longer registered.");
        }
        return devices.length > 0
          ? await push.test(devices)
          : status(
              409,
              "No phone is registered yet. Open CawCo on your phone and allow notifications."
            );
      }
    )
    .put(
      "/api/push/devices/:id",
      { body: t.Object({ quiet: t.Boolean() }) },
      ({ params, body, status }) =>
        db.push.setQuiet(params.id, body.quiet)
          ? { ok: true }
          : status(404, "That device is no longer registered.")
    )
    .delete("/api/push/devices/:id", async ({ params, status }) =>
      (await removeDevice(db, params.id))
        ? { ok: true }
        : status(404, "That device is no longer registered.")
    )
    // ── The app: register and unregister its pairing (hidden) ────────────
    .post(
      "/api/push/register",
      {
        ...hidden,
        body: t.Object({
          pairingId: t.String(),
          secret: t.String(),
          key: t.String(),
          name: t.String(),
          platform: t.Union([
            t.Literal("ios"),
            t.Literal("ipados"),
            t.Literal("macos"),
          ]),
          quiet: t.Optional(t.Boolean()),
        }),
      },
      ({ body, status }) => {
        if (!PAIRING_ID.test(body.pairingId)) {
          return status(400, "The pairing id is not a lowercase v4 uuid.");
        }
        if (!SECRET.test(body.secret)) {
          return status(
            400,
            "The pairing secret is not 32 bytes in base64url (43 characters)."
          );
        }
        if (!KEY.test(body.key)) {
          return status(
            400,
            "The push key is not 32 bytes in padded base64 (44 characters)."
          );
        }
        const device = db.push.putDevice({
          pairingId: body.pairingId,
          secret: body.secret,
          key: body.key,
          name: body.name.trim().slice(0, 120) || "iPhone",
          platform: body.platform,
          quiet: body.quiet,
        });
        return { ok: true, quiet: device.quiet };
      }
    )
    .post(
      "/api/push/unregister",
      { ...hidden, body: t.Object({ pairingId: t.String() }) },
      async ({ body }) => ({
        ok: true,
        removed: await removeDevice(db, body.pairingId),
      })
    );
