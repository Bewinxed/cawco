/**
 * Pushes to the iOS app (Projects spec §5.5, P2): content-free APNs alerts
 * from the hub when something newly needs you. A push names the session,
 * task or project and nothing else; its `cawco` data carries the ids the app
 * reads the details by, over the tailnet, once opened.
 *
 * - **Credentials** (team id, key id, the `.p8` key, bundle id, default
 *   environment) are one hub row, entered in Settings; the key is never
 *   answered by any route. The provider token is an ES256 JWT over that key,
 *   signed once and reused for 50 minutes (APNs refuses one older than 60).
 * - **Devices** are registered by the app on a hidden route; a token APNs
 *   answers 410 (Unregistered) for is deleted. A quiet device stays
 *   registered and is sent nothing.
 * - **Moments**: a session asks for permission or asks a question
 *   ({@link Push.onAsk}), a task enters a stage of kind `you`
 *   ({@link Push.taskChanged}), an attempt at a task fails
 *   ({@link Push.itemEnded}). Each item pushes at most once per transition:
 *   an ask once per request, and one collapse id per task, so a failed attempt
 *   that moves its task into a `you` stage is one push, not two.
 *
 * Sent over HTTP/2 (node:http2), one connection per APNs host, kept while
 * used. `CAWCO_APNS_ORIGIN` points every push at a stand-in (an `http://`
 * origin speaks h2c) — the Telegram bridge's `CAWCO_TELEGRAM_API` precedent.
 */
import {
  createHash,
  createPrivateKey,
  type KeyObject,
  sign,
} from "node:crypto";
import { type ClientHttp2Session, connect } from "node:http2";
import type { Envelope, PermissionRequestFrame } from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape, PushDeviceRow, WorkItemRow } from "./db";
import type { ApnsEnvironment } from "./db/schema";
import { hidden } from "./hidden";
import type { TaskEvent } from "./tasks";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

/** A stand-in for both hosts, for a local run. */
const ORIGIN_OVERRIDE = Bun.env.CAWCO_APNS_ORIGIN;

/** APNs takes a provider token for up to an hour; a new one every 50 minutes stays clear of it. */
const TOKEN_LIFE_MS = 50 * 60 * 1000;
/** One push per collapse id inside this window: a task's move and its failed attempt are one moment. */
const SAME_MOMENT_MS = 10_000;
/** An undelivered push is worth nothing after a day. */
const EXPIRY_S = 24 * 60 * 60;
/** A connection with nothing to send for this long is closed. */
const IDLE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
/** A token no device has: APNs checks the provider token before the device token. */
const PROBE_TOKEN = "0".repeat(64);

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

/** One device's answer from APNs. */
export interface PushOutcome {
  /** Last six characters of the device token. */
  readonly device: string;
  readonly name: string;
  /** The device was unregistered (410) and is gone. */
  readonly pruned: boolean;
  readonly reason: string | null;
  /** HTTP status, or 0 when APNs could not be reached. */
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

const base64url = (input: string | Buffer): string =>
  Buffer.from(input).toString("base64url");

/** A collapse id fits APNs' 64 bytes: long ids go as their hash. */
const collapse = (prefix: string, id: string): string =>
  `${prefix}-${id}`.length <= 64
    ? `${prefix}-${id}`
    : `${prefix}-${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;

const folder = (cwd: string): string =>
  cwd.split("/").filter(Boolean).pop() ?? cwd;

/** A session as its row names it: its title, the title its first message gave it, or its folder. */
const sessionName = (
  row:
    | { cwd: string; derivedTitle?: string | null; title?: string | null }
    | undefined
): string | undefined =>
  row
    ? row.title?.trim() || row.derivedTitle?.trim() || folder(row.cwd)
    : undefined;

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

/** Apple's Team ID and Key ID: ten capitals and digits. */
const APPLE_ID = /^[A-Z0-9]{10}$/;

/** Reads a `.p8` key; throws a sentence when it is not an EC P-256 private key. */
export const readApnsKey = (pem: string): KeyObject => {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem.trim());
  } catch (cause) {
    throw new Error(
      "The key does not read as a private key. Paste the whole .p8 file, BEGIN and END lines included.",
      { cause }
    );
  }
  if (key.asymmetricKeyType !== "ec") {
    throw new Error(
      "The key is not an elliptic-curve key. APNs keys are EC P-256 (.p8)."
    );
  }
  return key;
};

export const createPush = ({ db, task }: PushServices) => {
  let token: { at: number; fingerprint: string; jwt: string } | undefined;
  const sessions = new Map<string, ClientHttp2Session>();
  const idle = new Map<string, ReturnType<typeof setTimeout>>();
  /** Asks already pushed, by request id: a replayed or re-escalated ask is not a new moment. */
  const asked = new Set<string>();
  /** When each collapse id last went out. */
  const recent = new Map<string, number>();

  /** The provider token for the stored credentials, signed again after 50 minutes or a change. */
  const providerToken = (
    credentials: NonNullable<ReturnType<DbShape["push"]["credentials"]>>
  ): string => {
    const fingerprint = createHash("sha256")
      .update(
        `${credentials.teamId}\n${credentials.keyId}\n${credentials.privateKey}`
      )
      .digest("hex");
    const now = Date.now();
    if (
      token &&
      token.fingerprint === fingerprint &&
      now - token.at < TOKEN_LIFE_MS
    ) {
      return token.jwt;
    }
    const header = base64url(
      JSON.stringify({ alg: "ES256", kid: credentials.keyId })
    );
    const claims = base64url(
      JSON.stringify({ iss: credentials.teamId, iat: Math.floor(now / 1000) })
    );
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
      key: readApnsKey(credentials.privateKey),
      dsaEncoding: "ieee-p1363",
    });
    token = {
      at: now,
      fingerprint,
      jwt: `${header}.${claims}.${base64url(signature)}`,
    };
    return token.jwt;
  };

  const session = (origin: string): ClientHttp2Session => {
    const open = sessions.get(origin);
    if (open && !open.closed && !open.destroyed) {
      return open;
    }
    const opened = connect(origin);
    const forget = () => {
      if (sessions.get(origin) === opened) {
        sessions.delete(origin);
      }
    };
    opened.on("error", (error) => {
      console.warn(`[push] ${origin}: ${error.message}`);
      forget();
    });
    opened.on("goaway", forget);
    opened.on("close", forget);
    sessions.set(origin, opened);
    return opened;
  };

  /** Closes a host's connection once nothing has gone over it for a while. */
  const touch = (origin: string): void => {
    clearTimeout(idle.get(origin));
    const timer = setTimeout(() => {
      sessions.get(origin)?.close();
      sessions.delete(origin);
      idle.delete(origin);
    }, IDLE_MS);
    timer.unref?.();
    idle.set(origin, timer);
  };

  /** One POST to APNs; never throws. */
  const post = (
    environment: ApnsEnvironment,
    deviceToken: string,
    headers: Record<string, string>,
    body: string
  ): Promise<{ status: number; reason: string | null }> => {
    const origin = ORIGIN_OVERRIDE ?? HOSTS[environment];
    return new Promise((resolve) => {
      let settled = false;
      const done = (status: number, reason: string | null) => {
        if (!settled) {
          settled = true;
          resolve({ status, reason });
        }
      };
      try {
        const request = session(origin).request({
          ":method": "POST",
          ":path": `/3/device/${deviceToken}`,
          "content-type": "application/json",
          ...headers,
        });
        touch(origin);
        let status = 0;
        let text = "";
        request.setEncoding("utf8");
        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
          request.close();
          done(0, "APNs did not answer in 10 seconds");
        });
        request.on("response", (response) => {
          status = Number(response[":status"] ?? 0);
        });
        request.on("data", (chunk: string) => {
          text += chunk;
        });
        request.on("end", () => {
          let reason: string | null = null;
          if (text) {
            try {
              reason = (JSON.parse(text) as { reason?: string }).reason ?? null;
            } catch {
              reason = text.slice(0, 200);
            }
          }
          done(status, reason);
        });
        request.on("error", (error) => done(0, error.message));
        request.end(body);
      } catch (error) {
        done(0, error instanceof Error ? error.message : String(error));
      }
    });
  };

  const payloadOf = (notification: Notification): string =>
    JSON.stringify({
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

  /** Records what APNs said for a device: taken, unregistered (the device goes) or refused. */
  const settle = (
    device: PushDeviceRow,
    status: number,
    reason: string | null
  ): boolean => {
    if (status === 200) {
      db.push.noteResult(device.token, null);
      return false;
    }
    const pruned = status === 410 && db.push.dropDevice(device.token);
    if (!pruned) {
      if (
        reason === "ExpiredProviderToken" ||
        reason === "InvalidProviderToken"
      ) {
        token = undefined;
      }
      db.push.noteResult(
        device.token,
        reason ?? (status ? `APNs answered ${status}` : "APNs not reached")
      );
    }
    console.warn(
      `[push] ${device.name} (…${device.token.slice(-6)}): ${status} ${reason ?? ""}${pruned ? " — unregistered, removed" : ""}`
    );
    return pruned;
  };

  /** Sends one notification to every device that is not quiet (or to the ones given). */
  const deliver = async (
    notification: Notification,
    to?: PushDeviceRow[]
  ): Promise<PushOutcome[]> => {
    const credentials = db.push.credentials();
    if (!credentials) {
      return [];
    }
    const devices = to ?? db.push.devices().filter((device) => !device.quiet);
    if (devices.length === 0) {
      return [];
    }
    let jwt: string;
    try {
      jwt = providerToken(credentials);
    } catch (error) {
      console.warn(
        `[push] cannot sign: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
    const body = payloadOf(notification);
    const expiration = String(Math.floor(Date.now() / 1000) + EXPIRY_S);
    return await Promise.all(
      devices.map(async (device): Promise<PushOutcome> => {
        const { status, reason } = await post(
          device.environment,
          device.token,
          {
            authorization: `bearer ${jwt}`,
            "apns-topic": credentials.bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": expiration,
            "apns-collapse-id": notification.collapseId,
          },
          body
        );
        const pruned = settle(device, status, reason);
        return {
          device: device.token.slice(-6),
          name: device.name,
          status,
          reason,
          pruned,
        };
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
      const name =
        sessionName(row) ??
        (run ? db.getWorkflow(run.workflowId)?.name : undefined) ??
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
     * to its parent session, not to you.
     */
    itemEnded(item: WorkItemRow): void {
      if (item.state !== "failed" || !item.taskId || !item.projectId) {
        return;
      }
      moment({
        name: item.title,
        project: projectName(item.projectId),
        category: PUSH_CATEGORIES.attempt,
        collapseId: collapse("task", `${item.projectId}:${item.taskId}`),
        threadId: item.projectId,
        data: {
          kind: "attempt",
          instanceId: item.instanceId,
          projectId: item.projectId,
          taskId: item.taskId,
          workItemId: item.id,
        },
      });
    },

    /**
     * A test from Settings: a push to every registered device, quiet ones too.
     * With none registered, a probe to a token no device has: APNs checks the
     * provider token first, so `BadDeviceToken` means the credentials hold.
     */
    async test(): Promise<
      | { kind: "devices"; outcomes: PushOutcome[] }
      | { kind: "probe"; ok: boolean; status: number; reason: string | null }
    > {
      const credentials = db.push.credentials();
      if (!credentials) {
        throw new Error("No APNs credentials are saved.");
      }
      const devices = db.push.devices();
      if (devices.length > 0) {
        return {
          kind: "devices",
          outcomes: await deliver(
            {
              name: "CawCo",
              project: null,
              body: "Test push. This device gets what needs you.",
              category: PUSH_CATEGORIES.test,
              collapseId: "test",
              threadId: "test",
              data: { kind: "test" },
            },
            devices
          ),
        };
      }
      const { status, reason } = await post(
        credentials.environment,
        PROBE_TOKEN,
        {
          authorization: `bearer ${providerToken(credentials)}`,
          "apns-topic": credentials.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        payloadOf({
          name: "CawCo",
          project: null,
          body: "Test push. This device gets what needs you.",
          category: PUSH_CATEGORIES.test,
          collapseId: "test",
          threadId: "test",
          data: { kind: "test" },
        })
      );
      if (
        reason === "ExpiredProviderToken" ||
        reason === "InvalidProviderToken"
      ) {
        token = undefined;
      }
      return {
        kind: "probe",
        ok: status === 400 && reason === "BadDeviceToken",
        status,
        reason,
      };
    },

    /** Credentials changed: the next push signs a new token. */
    forgetToken(): void {
      token = undefined;
    },
  };
};

export type Push = ReturnType<typeof createPush>;

const ENVIRONMENT = t.Union([t.Literal("sandbox"), t.Literal("production")]);

/** What Settings shows of a device. */
const deviceView = (device: PushDeviceRow) => ({
  token: device.token,
  name: device.name,
  platform: device.platform,
  environment: device.environment,
  quiet: device.quiet,
  registeredAt: device.createdAt.getTime(),
  lastSentAt: device.lastSentAt?.getTime() ?? null,
  lastError: device.lastError,
});

/** A device token as APNs issues it: hex, at least 32 bytes. */
const TOKEN_PATTERN = /^[0-9a-f]{64,200}$/;

export const pushRoutes = (db: DbShape, push: Push) =>
  new Elysia()
    // ── Settings: credentials and devices (the key is never answered) ─────
    .get("/api/push", () => {
      const credentials = db.push.credentials();
      return {
        credentials: credentials
          ? {
              teamId: credentials.teamId,
              keyId: credentials.keyId,
              bundleId: credentials.bundleId,
              environment: credentials.environment,
              savedAt: credentials.savedAt.getTime(),
            }
          : null,
        devices: db.push.devices().map(deviceView),
      };
    })
    .put(
      "/api/push/credentials",
      {
        body: t.Object({
          teamId: t.String(),
          keyId: t.String(),
          /** Omitted to keep the stored key. */
          privateKey: t.Optional(t.String()),
          bundleId: t.String(),
          environment: ENVIRONMENT,
        }),
      },
      ({ body, status }) => {
        const teamId = body.teamId.trim();
        const keyId = body.keyId.trim();
        const bundleId = body.bundleId.trim();
        if (!(APPLE_ID.test(teamId) && APPLE_ID.test(keyId))) {
          return status(
            400,
            "Team ID and Key ID are 10 letters and digits each. Copy them from the Apple Developer account's Keys page."
          );
        }
        if (!bundleId) {
          return status(
            400,
            "Name the app's bundle ID, such as dev.cawco.app."
          );
        }
        const privateKey =
          body.privateKey?.trim() || db.push.credentials()?.privateKey;
        if (!privateKey) {
          return status(400, "Paste the .p8 key to save the credentials.");
        }
        try {
          readApnsKey(privateKey);
        } catch (error) {
          return status(400, (error as Error).message);
        }
        db.push.setCredentials({
          teamId,
          keyId,
          privateKey,
          bundleId,
          environment: body.environment,
        });
        push.forgetToken();
        return { ok: true };
      }
    )
    .delete("/api/push/credentials", () => {
      db.push.clearCredentials();
      push.forgetToken();
      return { ok: true };
    })
    .post("/api/push/test", async ({ status }) => {
      try {
        return await push.test();
      } catch (error) {
        return status(409, (error as Error).message);
      }
    })
    .put(
      "/api/push/devices/:token",
      { body: t.Object({ quiet: t.Boolean() }) },
      ({ params, body, status }) =>
        db.push.setQuiet(params.token, body.quiet)
          ? { ok: true }
          : status(404, "That device is no longer registered.")
    )
    .delete("/api/push/devices/:token", ({ params, status }) =>
      db.push.dropDevice(params.token)
        ? { ok: true }
        : status(404, "That device is no longer registered.")
    )
    // ── The app: register and unregister a device (hidden) ────────────────
    .post(
      "/api/push/register",
      {
        ...hidden,
        body: t.Object({
          token: t.String(),
          environment: ENVIRONMENT,
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
        const token = body.token.trim().toLowerCase();
        if (!TOKEN_PATTERN.test(token)) {
          return status(400, "The device token is not an APNs token in hex.");
        }
        const device = db.push.putDevice({
          token,
          environment: body.environment,
          name: body.name.trim().slice(0, 120) || "iPhone",
          platform: body.platform,
          quiet: body.quiet,
        });
        return { ok: true, quiet: device.quiet };
      }
    )
    .post(
      "/api/push/unregister",
      { ...hidden, body: t.Object({ token: t.String() }) },
      ({ body }) => ({
        ok: true,
        removed: db.push.dropDevice(body.token.trim().toLowerCase()),
      })
    );
