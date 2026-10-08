/**
 * Pushes to the iOS app (Projects spec §5.5, P2): content-free alerts from
 * the hub when something newly needs you. A push names the session, task or
 * project and nothing else; its `cawco` data carries the ids the app reads
 * the details by, over the tailnet, once opened.
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
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape, PushDeviceRow, WorkItemRow } from "./db";
import { hidden } from "./hidden";
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
 * is opened to be read, never approved from the lock screen.
 */
export const PUSH_CATEGORIES = {
  permission: "CAWCO_PERMISSION",
  permissionOpenOnly: "CAWCO_PERMISSION_OPEN",
  question: "CAWCO_QUESTION",
  task: "CAWCO_TASK",
  attempt: "CAWCO_ATTEMPT",
  test: "CAWCO_TEST",
} as const;

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
  | { kind: "task"; projectId: string; taskId: string }
  | {
      kind: "attempt";
      instanceId: string;
      projectId: string;
      taskId: string;
      workItemId: string;
    }
  | { kind: "test" };

interface Notification {
  /** Overrides the status line; only the test says something else. */
  readonly body?: string;
  readonly category: string;
  readonly collapseId: string;
  readonly data: PushData;
  /** Shown as the alert's title: the item's name. */
  readonly name: string;
  /** The project the item is in, as the alert's subtitle; omitted when it is the name. */
  readonly project: string | null;
  readonly threadId: string;
}

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

const payloadOf = (notification: Notification) => ({
  aps: {
    alert: {
      title: notification.name,
      ...(notification.project && notification.project !== notification.name
        ? { subtitle: notification.project }
        : {}),
      body: notification.body ?? "Needs you",
    },
    sound: "default",
    category: notification.category,
    "thread-id": notification.threadId,
    "mutable-content": 0,
  },
  cawco: notification.data,
});

/** One POST to Cawrier; never throws. `reason` is Cawrier's sentence, or APNs' reason it passed on. */
const post = async (
  device: PushDeviceRow,
  notification: Notification
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
        payload: payloadOf(notification),
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
    return await Promise.all(
      devices.map(async (device): Promise<PushOutcome> => {
        const { status, reason } = await post(device, notification);
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
   * A push title crosses Cawrier and APNs and shows on a lock screen (App
   * Review 4.5.4), so it never carries what the work said: not the title a
   * session's first message gave it, not a title the agent gave itself, not
   * its folder. Only a name the owner gave it, else "<harness> on <machine>".
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
      const run = payload.workflowRunId
        ? db.getWorkflowRun(payload.workflowRunId)
        : undefined;
      const owned =
        row?.titleSource === "owner" ? row.title?.trim() : undefined;
      const name =
        owned ||
        (run ? db.getWorkflow(run.workflowId)?.name : undefined) ||
        sessionName(instanceId) ||
        "A session";
      const projectId = row?.projectId ?? null;
      moment({
        name,
        project: projectName(projectId),
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
          moment({
            name: view.title,
            project: projectName(projectId),
            category: PUSH_CATEGORIES.task,
            collapseId: collapse("task", `${projectId}:${id}`),
            threadId: projectId,
            data: { kind: "task", projectId, taskId: id },
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
      task(projectId, taskId)
        .catch(() => undefined)
        .then((view) => {
          moment({
            name: view?.title || sessionName(item.instanceId) || "A task",
            project: projectName(projectId),
            category: PUSH_CATEGORIES.attempt,
            collapseId: collapse("task", `${projectId}:${taskId}`),
            threadId: projectId,
            data: {
              kind: "attempt",
              instanceId: item.instanceId,
              projectId,
              taskId,
              workItemId: item.id,
            },
          });
        });
    },

    /** A test: a push to the devices given, quiet ones too. */
    async test(devices: PushDeviceRow[]): Promise<{ outcomes: PushOutcome[] }> {
      return {
        outcomes: await deliver(
          {
            name: "Test from Caw",
            project: null,
            body: "Notifications work. When an agent needs you, it arrives like this.",
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

/** What Settings shows of a device; the secret never leaves the hub but for Cawrier. */
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
        const device = db.push.putDevice({
          pairingId: body.pairingId,
          secret: body.secret,
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
