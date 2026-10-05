/**
 * The fleet's update policy and the signed builds the hub hands to machines.
 * Only the hub talks to the release host: it discovers the channel's release,
 * verifies it, and serves manifest and archives to its machines, each of which
 * verifies them again against the embedded key.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  discoverRelease,
  fetchArchive,
  type LocatedRelease,
} from "@cawco/core/binary-distribution";
import { readInstallation } from "@cawco/core/binary-installation";
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { Elysia, t } from "elysia";

/** How long a discovered release is served before the host is asked again. */
const RELEASE_TTL_MS = 15 * 60_000;

interface Options {
  /** Marks a machine's finished update as seen; resolves to the control answer. */
  acknowledge: (machineId: string) => Promise<unknown>;
  /** Tell an online machine its policy changed; resolves when it answered. */
  configure: (
    machineId: string,
    policy: BinaryUpdatePolicy
  ) => Promise<unknown>;
  dbPath: string;
  online: () => string[];
  states: () => ReadonlyMap<string, BinaryUpdateState>;
}

export function createBinaryUpdates(options: Options) {
  const root = join(dirname(options.dbPath), "binary-releases");
  const policyPath = join(root, "policy.json");
  let policy: BinaryUpdatePolicy = existsSync(policyPath)
    ? (JSON.parse(readFileSync(policyPath, "utf8")) as BinaryUpdatePolicy)
    : { channel: "stable", autoUpdate: false };
  let current: { at: number; release: LocatedRelease } | undefined;
  let checking: Promise<LocatedRelease> | undefined;

  const savePolicy = () => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = `${policyPath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(policy)}\n`, { mode: 0o600 });
    renameSync(temporary, policyPath);
  };
  const discover = (): Promise<LocatedRelease> => {
    checking ??= (async () => {
      const installation = await readInstallation();
      const release = await discoverRelease(
        policy.channel,
        installation?.releaseHost
      );
      current = { at: Date.now(), release };
      return release;
    })().finally(() => {
      checking = undefined;
    });
    return checking;
  };
  const release = async (): Promise<LocatedRelease> =>
    current && Date.now() - current.at < RELEASE_TTL_MS
      ? current.release
      : await discover();

  const routes = new Elysia()
    .get("/api/binary-updates/settings", () => policy)
    .put(
      "/api/binary-updates/settings",
      {
        body: t.Object({
          channel: t.Union([t.Literal("stable"), t.Literal("nightly")]),
          autoUpdate: t.Boolean(),
        }),
      },
      async ({ body }) => {
        policy = body;
        current = undefined;
        savePolicy();
        await Promise.all(
          options.online().map((id) => options.configure(id, policy))
        );
        return policy;
      }
    )
    .get("/api/binary-updates/machines", () => ({
      machines: Object.fromEntries(options.states()),
    }))
    .post("/api/binary-updates/check", async () => {
      const found = await discover();
      return {
        version: found.manifest.version,
        channel: found.manifest.channel,
        notes: found.manifest.notes,
      };
    })
    .post(
      "/api/binary-updates/machines/:machineId/acknowledge",
      async ({ params }) => {
        await options.acknowledge(params.machineId);
        return { ok: true };
      }
    )
    .get("/api/binary-updates/release", async () => {
      const found = await release();
      return { manifest: found.manifest, signature: found.signature };
    })
    .get(
      "/api/binary-updates/artifacts/:version/:archive",
      async ({ params, status }) => {
        const found = await release();
        const artifact = found.manifest.artifacts.find(
          (row) => row.archive === params.archive
        );
        if (params.version !== found.manifest.version || !artifact) {
          return status(404, "This build is not what the channel offers now");
        }
        return new Response(
          Bun.file(await fetchArchive(found, artifact.target, root))
        );
      }
    );
  return { routes, policy: () => policy };
}
