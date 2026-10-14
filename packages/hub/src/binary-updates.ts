/**
 * The fleet's update policy and the signed builds the hub hands to machines.
 * Only the hub talks to the release host. It serves two things: its own
 * machine the channel's newest build, and every other machine the build the hub
 * itself is running, so no machine is ever ahead of its hub. Each machine
 * verifies what it is given against the embedded release key.
 */
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type DamagedHubRecord, damagedHubRecordWords } from "@cawco/core";
import {
  assetBase,
  discoverRelease,
  fetchArchive,
  type LocatedRelease,
  NoReleaseError,
  type SignedRelease,
} from "@cawco/core/binary-distribution";
import {
  readInstallation,
  readRunningManifest,
  versionDirectory,
} from "@cawco/core/binary-installation";
import type {
  BinaryUpdateChannels,
  BinaryUpdatePolicy,
  BinaryUpdateState,
  ChannelRelease,
} from "@cawco/core/binary-updates";
import {
  DamagedRecord,
  isDamagedRecord,
  readRecordSync,
  writeStateFileSync,
} from "@cawco/core/state-file";
import { Elysia, t } from "elysia";
import { hidden } from "./hidden";
import { fenceHub, hubRestartReadiness } from "./restart-holds";

/** How long a discovered release is served before the host is asked again. */
const RELEASE_TTL_MS = 15 * 60_000;

interface Options {
  /** Returns a machine waiting to install (on work in flight, or on its keeper) to `available`. */
  cancel: (machineId: string) => Promise<unknown>;
  /** Tell an online machine its policy changed; resolves when it answered. */
  configure: (
    machineId: string,
    policy: BinaryUpdatePolicy
  ) => Promise<unknown>;
  dbPath: string;
  online: () => string[];
  /** Records what a machine says its update state is, ahead of its next heartbeat. */
  setState: (machineId: string, state: BinaryUpdateState) => void;
  states: () => ReadonlyMap<string, BinaryUpdateState>;
}

/** How many migrations the hub's database has applied. */
function databaseSchemaVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (
      db.query("SELECT count(*) AS n FROM __drizzle_migrations").get() as {
        n: number;
      }
    ).n;
  } finally {
    db.close();
  }
}

/** The signed manifest and signature of the build this hub is running. */
async function runningRelease(): Promise<LocatedRelease> {
  const manifest = await readRunningManifest();
  const { signature } = JSON.parse(
    readFileSync(
      join(versionDirectory(manifest.version), "release.signature.json"),
      "utf8"
    )
  ) as { signature: string };
  const installation = await readInstallation();
  return {
    manifest,
    signature,
    assetBaseUrl: assetBase(manifest, installation?.releaseHost),
  };
}

/** The policy a hub with no record yet starts with, and the one Reset writes. */
const FIRST_POLICY: BinaryUpdatePolicy = {
  channel: "stable",
  autoUpdate: false,
};

const isPolicy = (value: unknown): value is BinaryUpdatePolicy => {
  const { channel, autoUpdate } = (value ?? {}) as Record<string, unknown>;
  return (
    (channel === "stable" || channel === "nightly") &&
    typeof autoUpdate === "boolean"
  );
};

/**
 * The policy at `path`: the first one on a hub with none yet, or what is
 * wrong with it. A damaged record does not stop the hub: updates are off,
 * every route that needs the policy says why (409), and nothing reads the
 * damaged file as the first policy. Reset writes a fresh one.
 */
const loadPolicy = (
  path: string
): { policy: BinaryUpdatePolicy } | { damaged: DamagedHubRecord } => {
  try {
    const kept = readRecordSync<unknown>(path);
    if (kept === undefined) {
      return { policy: FIRST_POLICY };
    }
    if (!isPolicy(kept)) {
      throw new DamagedRecord(path, "it is not an update policy");
    }
    return { policy: { channel: kept.channel, autoUpdate: kept.autoUpdate } };
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    const damaged = { file: error.file, reason: error.reason };
    console.warn(
      `[updates] ${damagedHubRecordWords("update policy", damaged)}`
    );
    return { damaged };
  }
};

export function createBinaryUpdates(options: Options) {
  const root = join(dirname(options.dbPath), "binary-releases");
  const policyPath = join(root, "policy.json");
  let held = loadPolicy(policyPath);
  let current: { at: number; release: LocatedRelease } | undefined;
  let checking: Promise<LocatedRelease> | undefined;

  /** What a route that needs the policy answers while its record is damaged. */
  const refused = (): string =>
    "damaged" in held
      ? damagedHubRecordWords("update policy", held.damaged)
      : "The update policy reads whole.";
  /** The policy; only routes that refused a damaged record first reach this. */
  const policyNow = (): BinaryUpdatePolicy => {
    if ("damaged" in held) {
      throw new Error(refused());
    }
    return held.policy;
  };
  const savePolicy = (policy: BinaryUpdatePolicy) => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writeStateFileSync(policyPath, `${JSON.stringify(policy)}\n`, {
      mode: 0o600,
    });
    held = { policy };
  };
  const discover = (): Promise<LocatedRelease> => {
    checking ??= (async () => {
      const installation = await readInstallation();
      const release = await discoverRelease(
        policyNow().channel,
        installation?.releaseHost
      );
      current = { at: Date.now(), release };
      return release;
    })().finally(() => {
      checking = undefined;
    });
    return checking;
  };
  // What each channel's newest release is, one entry per channel, served for RELEASE_TTL_MS like
  // `current`; null where the host has none.
  const channelCache = new Map<
    BinaryUpdatePolicy["channel"],
    { at: number; release: ChannelRelease | null }
  >();
  let channelsCheckedAt = 0;
  const discoverChannel = async (
    channel: BinaryUpdatePolicy["channel"]
  ): Promise<void> => {
    const installation = await readInstallation();
    try {
      const { manifest } = await discoverRelease(
        channel,
        installation?.releaseHost
      );
      channelCache.set(channel, {
        at: Date.now(),
        release: {
          version: manifest.version,
          sequence: manifest.sequence,
          notes: manifest.notes,
        },
      });
    } catch (error) {
      if (!(error instanceof NoReleaseError)) {
        throw error;
      }
      channelCache.set(channel, { at: Date.now(), release: null });
    }
  };
  const channels = async (refresh: boolean): Promise<BinaryUpdateChannels> => {
    if (refresh) {
      current = undefined;
      channelCache.clear();
    }
    const stale = (["stable", "nightly"] as const).filter((channel) => {
      const cached = channelCache.get(channel);
      return !cached || Date.now() - cached.at >= RELEASE_TTL_MS;
    });
    if (stale.length > 0) {
      await Promise.all(stale.map(discoverChannel));
      channelsCheckedAt = Date.now();
    }
    return {
      channels: {
        stable: channelCache.get("stable")?.release ?? null,
        nightly: channelCache.get("nightly")?.release ?? null,
      },
      checkedAt: channelsCheckedAt,
    };
  };
  const newest = async (): Promise<LocatedRelease> =>
    current && Date.now() - current.at < RELEASE_TTL_MS
      ? current.release
      : await discover();

  /** A new policy, written whole, and every online machine told. */
  const adopt = async (policy: BinaryUpdatePolicy) => {
    current = undefined;
    savePolicy(policy);
    await Promise.all(
      options.online().map((id) => options.configure(id, policy))
    );
    return policy;
  };

  // A damaged policy record: every route that needs the policy answers 409
  // with its words (`refused`), and Reset is the way out.
  const routes = new Elysia()
    .get("/api/binary-updates/settings", ({ status }) =>
      "damaged" in held ? status(409, refused()) : held.policy
    )
    .put(
      "/api/binary-updates/settings",
      {
        body: t.Object({
          channel: t.Union([t.Literal("stable"), t.Literal("nightly")]),
          autoUpdate: t.Boolean(),
        }),
      },
      ({ body, status }) =>
        "damaged" in held ? status(409, refused()) : adopt(body)
    )
    // Reset: the one way out of a damaged policy record. A fresh record (the
    // policy a new hub starts with) written whole, every online machine told,
    // and updates on again. Refused while the record reads whole.
    .post("/api/binary-updates/settings/reset", ({ status }) => {
      if (!("damaged" in held)) {
        return status(
          409,
          "The update policy record reads whole, so there is nothing to reset."
        );
      }
      console.info(`[updates] ${held.damaged.file} reset: updates are on`);
      return adopt(FIRST_POLICY);
    })
    .get("/api/binary-updates/machines", () => ({
      machines: Object.fromEntries(options.states()),
    }))
    .post("/api/binary-updates/check", async ({ status }) => {
      if ("damaged" in held) {
        return status(409, refused());
      }
      const found = await discover();
      return {
        version: found.manifest.version,
        sequence: found.manifest.sequence,
        channel: found.manifest.channel,
        notes: found.manifest.notes,
      };
    })
    .get("/api/binary-updates/channels", () => channels(false))
    .post("/api/binary-updates/channels", () => channels(true))
    // A machine tells the hub it is installing before it starts, so no start is
    // sent to it in the seconds before its next heartbeat would have said so.
    .put(
      "/api/binary-updates/machines/:machineId/state",
      { body: t.Any() },
      ({ params, body }) => {
        options.setState(params.machineId, body as BinaryUpdateState);
        return { ok: true };
      }
    )
    .post(
      "/api/binary-updates/machines/:machineId/cancel",
      async ({ params }) => {
        await options.cancel(params.machineId);
        return { ok: true };
      }
    )
    // The hub's own machine, before its update restarts this hub: what the
    // restart would cut (the tool calls held open here, from every machine),
    // and the fence that refuses new ones until it happens. `ms: 0` lowers it.
    .get("/api/binary-updates/hub-readiness", hidden, () =>
      hubRestartReadiness()
    )
    .post(
      "/api/binary-updates/hub-fence",
      { ...hidden, body: t.Object({ ms: t.Number({ minimum: 0 }) }) },
      ({ body }) => fenceHub(body.ms)
    )
    // What every machine other than the hub's own applies: the build the hub runs.
    .get("/api/binary-updates/release", async ({ status }) => {
      try {
        const running = await runningRelease();
        return { manifest: running.manifest, signature: running.signature };
      } catch (error) {
        return status(
          404,
          error instanceof Error ? error.message : String(error)
        );
      }
    })
    // What the hub's own machine considers: the channel's newest, and the
    // database's schema, so it never installs a build older than its data.
    .get("/api/binary-updates/latest", async ({ status }) => {
      if ("damaged" in held) {
        return status(409, refused());
      }
      const found = await newest();
      return {
        manifest: found.manifest,
        signature: found.signature,
        dbSchemaVersion: databaseSchemaVersion(options.dbPath),
      } satisfies SignedRelease & { dbSchemaVersion: number };
    })
    .get(
      "/api/binary-updates/artifacts/:version/:archive",
      async ({ params, status }) => {
        const candidates = [await runningRelease().catch(() => undefined)];
        if (current) {
          candidates.push(current.release);
        }
        const found = candidates.find(
          (row) =>
            row?.manifest.version === params.version &&
            row.manifest.artifacts.some((a) => a.archive === params.archive)
        );
        const artifact = found?.manifest.artifacts.find(
          (a) => a.archive === params.archive
        );
        if (found && artifact) {
          return new Response(
            Bun.file(await fetchArchive(found, artifact.target, root))
          );
        }
        return status(404, "This build is not one the hub offers");
      }
    );
  return { routes };
}
