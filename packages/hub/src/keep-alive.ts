import {
  type ClaudeLimits,
  type Envelope,
  type KeepAlive,
  type NeutralResultMessage,
  type NeutralUserMessage,
  promptCacheUsage,
  resolveRates,
  type SendPayload,
} from "@cawco/core";
import type { DbShape } from "./db";

export type KeepAliveRow = ReturnType<DbShape["getInstancesByIds"]>[number];

export const isKeepAlive = (
  message: NeutralUserMessage | null | undefined
): boolean =>
  message?.origin?.kind === "system" && message.origin.name === "keepalive";

export const keepAliveCap = (row: KeepAliveRow): number => {
  // Claude's documented 0.05x read multiplier; the bundled price catalog
  // predates this model. The cap is a ratio and needs no guessed USD rate.
  if (row.model?.replaceAll(".", "-") === "claude-opus-5-5") {
    return row.cacheTtl === "1h" ? 40 : 25;
  }
  const rates = row.model ? resolveRates(row.model) : null;
  if (!rates || rates.cacheRead <= 0) {
    return row.cacheTtl === "1h" ? 20 : 12;
  }
  return Math.floor(
    (row.cacheTtl === "1h" ? rates.cacheWrite1h : rates.cacheWrite) /
      rates.cacheRead
  );
};

export const promptCacheExpiresAt = (
  row: KeepAliveRow,
  lastTurnAt?: string | null
): number | null => {
  if (row.cacheCold) {
    return null;
  }
  if (row.cacheTtl && row.lastRequestAt) {
    return (
      row.lastRequestAt.getTime() +
      (row.cacheTtl === "1h" ? 3_600_000 : 300_000)
    );
  }
  // Without a measurement, only the longest Claude lifetime proves expiry.
  return row.harness === "claude" && lastTurnAt
    ? new Date(lastTurnAt).getTime() + 3_600_000
    : null;
};

/** Clock and account reading are explicit: this function sends and writes nothing. */
export const keepAliveState = (
  row: KeepAliveRow,
  usage: ClaudeLimits | undefined,
  now: number
): KeepAlive => {
  const base = {
    on: row.keepAliveEnabled,
    nextAt: null,
    sent: row.keepAliveSent,
    cap: keepAliveCap(row),
    ttl: row.cacheTtl,
    cold: row.cacheCold,
    lastPingUsage: row.lastPingUsage,
    contextTokens: row.contextTokens,
    contextReadAt: row.contextReadAt?.getTime() ?? null,
  };
  if (!row.keepAliveEnabled) {
    return { ...base, state: row.keepAliveStopped ?? "off" };
  }
  if (row.status === "sleeping") {
    return { ...base, state: "asleep" };
  }
  if (row.cacheCold) {
    return { ...base, state: "cold" };
  }
  if (
    usage?.windows.some(
      (window) =>
        window.kind === "session" &&
        window.severity === "critical" &&
        (!window.resetsAt || Date.parse(window.resetsAt) > now)
    )
  ) {
    return { ...base, state: "paused-usage" };
  }
  const expires = promptCacheExpiresAt(row);
  if (expires === null) {
    return { ...base, state: "cold" };
  }
  return expires <= now
    ? { ...base, state: "cold" }
    : {
        ...base,
        state: "waiting",
        nextAt: expires - (row.cacheTtl === "1h" ? 600_000 : 60_000),
      };
};

/** Usage counts include uncached input plus cache reads and writes, as Claude reports them. */
export const keepAliveUsage = promptCacheUsage;

export const keepAliveResult = (
  row: KeepAliveRow,
  result: NeutralResultMessage,
  ping: boolean
) => {
  const { cache = { read: 0, write: 0 } } = result;
  const usage = keepAliveUsage(result);
  const { input, read } = usage;
  const hit = input > 0 && read >= input * 0.9;
  const at = Date.now();
  let cold = row.cacheCold;
  if (ping && !hit) {
    cold = {
      reason:
        input > 0
          ? `ping read ${Math.round((read / input) * 100)}%`
          : "ping reported no cache usage",
      at,
    };
  } else if (
    !ping &&
    result.cacheReusable === true &&
    result.cache &&
    result.lastRequestAt !== undefined &&
    input > 0
  ) {
    cold = null;
  }
  const sent = ping ? row.keepAliveSent + 1 : 0;
  // An unknown lifetime remains unknown. Cache reads retain the last observed write lifetime.
  let ttl = row.cacheTtl;
  if ((cache.write1h ?? 0) > 0) {
    ttl = "1h";
  }
  if ((cache.write5m ?? 0) > 0) {
    ttl = "5m";
  }
  let stopped = row.keepAliveStopped;
  if (ping && sent >= keepAliveCap({ ...row, cacheTtl: ttl })) {
    stopped = "stopped-cap";
  }
  if (["stopped", "discarded", "error"].includes(row.status)) {
    stopped = null;
  }
  return {
    cacheTtl: ttl,
    ...(result.cache
      ? { contextTokens: input, contextReadAt: new Date() }
      : {}),
    ...(result.lastRequestAt === undefined
      ? {}
      : { lastRequestAt: new Date(result.lastRequestAt) }),
    keepAliveSent: sent,
    cacheCold: cold,
    lastPingUsage: ping ? { ...usage, at } : row.lastPingUsage,
    keepAliveTurn: null,
    keepAliveStopped: stopped,
    ...(stopped ? { keepAliveEnabled: false } : {}),
  } satisfies Parameters<DbShape["updateKeepAlive"]>[1];
};

interface KeepAlivePorts {
  changed: () => void;
  idle: (row: KeepAliveRow) => boolean | Promise<boolean>;
  rows: () => KeepAliveRow[];
  send: (envelope: Envelope<SendPayload>) => unknown;
  usage: () => ReturnType<DbShape["listUsageLimits"]>;
}

export const tickKeepAlive = async (
  ports: KeepAlivePorts,
  now = Date.now()
): Promise<void> => {
  const readings = new Map(
    ports.usage().map((reading) => [reading.machineId, reading.payload])
  );
  for (const row of ports.rows()) {
    if (
      !(
        row.keepAliveEnabled &&
        row.harness === "claude" &&
        row.status === "running" &&
        !row.keepAliveTurn
      )
    ) {
      continue;
    }
    // A process reading can await a machine. Re-read the stored schedule after
    // it answers: a real send, toggle or result may have moved it meanwhile.
    // biome-ignore lint/performance/noAwaitInLoops: each due session needs its own fresh idle receipt before its send
    if (!(await ports.idle(row))) {
      continue;
    }
    const fresh = ports.rows().find((candidate) => candidate.id === row.id);
    if (
      !(
        fresh?.keepAliveEnabled &&
        fresh.status === "running" &&
        !fresh.keepAliveTurn
      )
    ) {
      continue;
    }
    const due = keepAliveState(
      fresh,
      ports.usage().find((reading) => reading.machineId === fresh.machineId)
        ?.payload,
      Date.now()
    );
    if (
      due.state !== "waiting" ||
      due.nextAt === null ||
      Date.now() < due.nextAt
    ) {
      continue;
    }
    console.info(
      `[keepalive] ${fresh.id}: send due ${new Date(due.nextAt).toISOString()} at ${new Date().toISOString()}`
    );
    const state = keepAliveState(row, readings.get(row.machineId), now);
    if (
      state.state !== "waiting" ||
      state.nextAt === null ||
      now < state.nextAt
    ) {
      continue;
    }
    ports.send({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          keepAlive: true,
          origin: { kind: "system", name: "keepalive" },
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: `Keep-alive ${crypto.randomUUID().slice(0, 4)}: automatic message that keeps this session's prompt cache warm. Do not use any tool and do not continue any work. Reply with exactly: ok`,
          },
        },
      },
    });
  }
};

/** Timers are disposable; every deadline is re-derived from the stored request. */
export const createKeepAliveScheduler = (ports: KeepAlivePorts) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  const plan = () => {
    if (timer) {
      clearTimeout(timer);
    }
    if (stopped) {
      return;
    }
    const now = Date.now();
    const readings = new Map(
      ports.usage().map((reading) => [reading.machineId, reading.payload])
    );
    // Retry due-but-busy/unreachable sessions, while a future due time gets an
    // exact wake even when it falls between those retry ticks.
    let at = now + 30_000;
    for (const row of ports.rows()) {
      const state = keepAliveState(row, readings.get(row.machineId), now);
      if (
        state.state === "waiting" &&
        state.nextAt !== null &&
        state.nextAt > now
      ) {
        at = Math.min(at, state.nextAt);
      }
    }
    timer = setTimeout(
      () => {
        // biome-ignore lint/complexity/noVoid: wake catches and reports a failed machine read
        void wake();
      },
      Math.max(0, at - now)
    );
    timer.unref?.();
  };
  const wake = async () => {
    if (running || stopped) {
      return;
    }
    running = true;
    if (timer) {
      clearTimeout(timer);
    }
    try {
      await tickKeepAlive(ports);
      ports.changed();
    } catch (error) {
      console.error("[keepalive] schedule wake failed:", error);
    } finally {
      running = false;
      plan();
    }
  };
  // Boot and reconnect use this same path: an overdue warm schedule runs as
  // soon as its machine can supply an idle receipt, not after another margin.
  // biome-ignore lint/complexity/noVoid: startup must not wait for machines to reconnect
  void wake();
  return {
    wake,
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
};
