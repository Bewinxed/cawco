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
 *
 * `CAWCO_CAWRIER_ORIGIN` points every push at a stand-in for a local run —
 * the Telegram bridge's `CAWCO_TELEGRAM_API` precedent.
 */
import { createHash } from "node:crypto";
import {
  type Envelope,
  machineLabel,
  type PermissionRequestFrame,
  questionsOf,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { firstLine } from "@cawco/core/tool-presentation";
import { Elysia, t } from "elysia";
import type { DbShape, PushDeviceRow, WorkItemRow } from "./db";
import { hidden } from "./hidden";
import { boardTitle } from "./labels";
import type { TaskEvent } from "./tasks";

const CAWRIER = Bun.env.CAWCO_CAWRIER_ORIGIN ?? "https://cawrier.cawco.dev";

/** One push per collapse id inside this window: a task's move and its failed attempt are one moment. */
const SAME_MOMENT_MS = 10_000;
/** An undelivered push is worth nothing after a day. */
const EXPIRY_S = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

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
      projectId: string | null;
      requestId: string;
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

/** The payload APNs gets, `e` the sealed alert in base64. */
const payloadOf = (notification: Notification, e: string) => ({
  aps: {
    alert: notification.shown,
    sound: "default",
    category: notification.category,
    "thread-id": notification.threadId,
    "mutable-content": 1,
  },
  e,
  cawco: notification.data,
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
const plaintextOf = (notification: Notification): Plaintext => {
  const room =
    MAX_PAYLOAD_BYTES - byteLength(JSON.stringify(payloadOf(notification, "")));
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
  /** A task as a read shows it; undefined when it cannot be read. */
  readonly task: (
    projectId: string,
    taskId: string
  ) => Promise<{ kind: string | null; title: string } | undefined>;
}

/** A collapse id fits APNs' 64 bytes: long ids go as their hash. */
const collapse = (prefix: string, id: string): string =>
  `${prefix}-${id}`.length <= 64
    ? `${prefix}-${id}`
    : `${prefix}-${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;

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
 * One POST to Cawrier, the alert sealed for this device; never throws.
 * `reason` is Cawrier's sentence, or APNs' reason it passed on.
 */
const post = async (
  device: PushDeviceRow,
  notification: Notification,
  plaintext: Plaintext
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
        collapseId: notification.collapseId,
        expiration: Math.floor(Date.now() / 1000) + EXPIRY_S,
        payload: payloadOf(notification, await seal(device.key, plaintext)),
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

export const createPush = ({ db, task }: PushServices) => {
  /** Asks already pushed, by request id: a replayed or re-escalated ask is not a new moment. */
  const asked = new Set<string>();
  /** When each collapse id last went out. */
  const recent = new Map<string, number>();
  /** Sessions whose running turn the operator interrupted: its end pushes nothing. */
  const stopped = new Set<string>();

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

  /** Sends one notification to every device that is not quiet (or to the ones given). */
  const deliver = async (
    notification: Notification,
    to?: PushDeviceRow[]
  ): Promise<PushOutcome[]> => {
    const devices = to ?? db.push.devices().filter((device) => !device.quiet);
    const plaintext = plaintextOf(notification);
    return await Promise.all(
      devices.map(async (device): Promise<PushOutcome> => {
        const { status, reason } = await post(device, notification, plaintext);
        const pruned = settle(device, status, reason);
        return { name: device.name, status, reason, pruned };
      })
    );
  };

  /** Sends unless the same collapse id went out a moment ago. */
  const moment = (notification: Notification): void => {
    const now = Date.now();
    for (const [id, at] of recent) {
      if (now - at > SAME_MOMENT_MS) {
        recent.delete(id);
      }
    }
    if (recent.has(notification.collapseId)) {
      return;
    }
    recent.set(notification.collapseId, now);
    deliver(notification).catch((error: unknown) =>
      console.warn(
        `[push] ${notification.collapseId}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

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

  return {
    /**
     * A session (or a workflow) is blocked on you: a permission or a question.
     * Call wherever the ask reaches the operator (beside the Telegram
     * bridge's `onAsk`); a request is pushed once however often it is called.
     */
    onAsk(envelope: Envelope): void {
      const payload = envelope.payload as Partial<PermissionRequestFrame> & {
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
      const projectId = row?.projectId ?? null;
      const project = projectName(projectId);
      // The ask's presentation, stamped as it parked (ask-presentation.ts):
      // the session as the board names it, and the needs-you card's line.
      const { asker, summary } = (payload as PermissionRequestFrame)
        .presentation;
      const options = inlineOptions(payload, instanceId);
      moment({
        shown: alertOf(
          askName(row, payload.workflowRunId, instanceId),
          project
        ),
        sealed: {
          ...alertOf(asker, project, summary),
          ...(options ? { options } : {}),
        },
        category: askCategory(payload),
        collapseId: collapse("ask", requestId),
        threadId: projectId ?? instanceId,
        data: {
          kind: "ask",
          instanceId,
          machineId: envelope.machineId,
          projectId,
          requestId,
          workflowRunId: payload.workflowRunId ?? null,
        },
      });
    },

    /** An ask left the pending list: a later ask can never reuse its id, so its mark goes. */
    onSettled(requestId: string): void {
      asked.delete(requestId);
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
     * It waits {@link LOOK_GRACE_MS} first: a dashboard that has the session
     * in front marks it looked at as the turn ends, and then nothing goes.
     * The app does not mark looks, so a session open in the app still pushes.
     * One collapse id per session: a newer turn's push replaces the older.
     */
    turnEnded(
      instanceId: string,
      reply: string | undefined,
      endedAt: Date
    ): void {
      if (stopped.delete(instanceId)) {
        return;
      }
      setTimeout(() => {
        const [row] = db.getInstancesByIds([instanceId]);
        if (
          !row ||
          row.parentInstanceId ||
          row.workflowStepId ||
          row.workItemId ||
          row.kind === "summariser" ||
          row.role === "lead" ||
          (row.seenAt && row.seenAt.getTime() >= endedAt.getTime())
        ) {
          return;
        }
        const project = projectName(row.projectId);
        moment({
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
          collapseId: collapse("turn", instanceId),
          threadId: row.projectId ?? instanceId,
          data: {
            kind: "turn",
            instanceId,
            machineId: row.machineId,
            projectId: row.projectId ?? null,
          },
        });
      }, LOOK_GRACE_MS);
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
          moment({
            shown: alert,
            sealed: alert,
            category: row ? PUSH_CATEGORIES.task : PUSH_CATEGORIES.taskOpenOnly,
            collapseId: collapse("task", `${projectId}:${id}`),
            threadId: projectId,
            data: {
              kind: "task",
              instanceId: row?.id ?? null,
              machineId: row?.machineId ?? null,
              projectId,
              taskId: id,
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
      const alerted = task(projectId, taskId)
        .catch(() => undefined)
        .then((view) => {
          const project = projectName(projectId);
          const [row] = db.getInstancesByIds([item.instanceId]);
          moment({
            shown: alertOf(
              view?.title || sessionName(item.instanceId) || "A task",
              project
            ),
            sealed: alertOf(
              view?.title || (row ? boardTitle(row) : "A task"),
              project
            ),
            category: PUSH_CATEGORIES.attempt,
            collapseId: collapse("task", `${projectId}:${taskId}`),
            threadId: projectId,
            data: {
              kind: "attempt",
              instanceId: item.instanceId,
              machineId: row?.machineId ?? null,
              projectId,
              taskId,
              workItemId: item.id,
            },
          });
        });
      detach(alerted, "attempt push");
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
