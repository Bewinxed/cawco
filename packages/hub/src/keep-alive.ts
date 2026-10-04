import {
  type ClaudeLimits,
  type Envelope,
  type KeepAlive,
  type NeutralResultMessage,
  type NeutralUserMessage,
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

export const promptCacheExpiresAt = (row: KeepAliveRow): number | null =>
  row.cacheTtl && row.lastRequestAt
    ? row.lastRequestAt.getTime() +
      (row.cacheTtl === "1h" ? 3_600_000 : 300_000)
    : null;

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
  };
  if (!row.keepAliveEnabled) {
    return { ...base, state: row.keepAliveStopped ?? "off" };
  }
  if (row.status === "sleeping") {
    return { ...base, state: "asleep" };
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
export const keepAliveResult = (
  row: KeepAliveRow,
  result: NeutralResultMessage,
  ping: boolean
) => {
  const { cache = { read: 0, write: 0 } } = result;
  const { usage } = result as NeutralResultMessage & {
    usage?: { input_tokens?: number };
  };
  const input = (usage?.input_tokens ?? 0) + cache.read + cache.write;
  const hit = input > 0 && cache.read >= input / 2;
  const misses = ping && !hit ? row.keepAliveMisses + 1 : 0;
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
  if (ping && misses >= 2) {
    stopped = "stopped-miss";
  }
  if (["stopped", "discarded", "error"].includes(row.status)) {
    stopped = null;
  }
  return {
    cacheTtl: ttl,
    ...(result.lastRequestAt === undefined
      ? {}
      : { lastRequestAt: new Date(result.lastRequestAt) }),
    keepAliveSent: sent,
    keepAliveMisses: misses,
    keepAliveTurn: null,
    keepAliveStopped: stopped,
    ...(stopped ? { keepAliveEnabled: false } : {}),
  } satisfies Parameters<DbShape["updateKeepAlive"]>[1];
};

export const tickKeepAlive = (
  ports: {
    rows: () => KeepAliveRow[];
    usage: () => ReturnType<DbShape["listUsageLimits"]>;
    idle: (row: KeepAliveRow) => boolean;
    send: (envelope: Envelope<SendPayload>) => unknown;
  },
  now = Date.now()
): void => {
  const readings = new Map(
    ports.usage().map((reading) => [reading.machineId, reading.payload])
  );
  for (const row of ports.rows()) {
    if (
      !(
        row.keepAliveEnabled &&
        row.harness === "claude" &&
        row.status === "running" &&
        !row.keepAliveTurn &&
        ports.idle(row)
      )
    ) {
      continue;
    }
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
