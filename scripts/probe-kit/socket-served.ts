/**
 * The dashboard as the owner's machines run it: serve.js on the published
 * build, handed its listening sockets by systemd's own socket activation
 * (`systemd-socket-activate`), its `/ws` relay the raw-socket one in
 * front of the hub.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import {
  ADAPTER_OUTPUT,
  builtKey,
  PUBLISHED_STAMP,
  publishedKey,
  ROOT,
} from "./kit";
import type { KitFleet } from "./spec";

/** A loopback port free now. */
export const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/**
 * The run's built dashboard (built before `kit.fleet` answers) published
 * where serve.js reads it, `apps/dashboard/build`, as the product publishes
 * it (apps/dashboard/scripts/publish-build.ts moves adapter-node's half
 * there), stamped with the tree it was built from (kit.ts
 * `PUBLISHED_STAMP`), so the build stays whole for every spec and run that
 * serves it (kit.ts `stampSays`). Published already, `build` is that build.
 */
export const publishBuild = async (): Promise<void> => {
  const key = await builtKey();
  if (!existsSync(ADAPTER_OUTPUT)) {
    if (key !== "" && (await publishedKey()) === key) {
      return;
    }
    throw new Error(
      `apps/dashboard/.build-next is gone and build/ holds no build of the run's tree ${key.slice(0, 12) || "(none built)"}: something outside the kit published there`
    );
  }
  await $`bun ${join(ROOT, "apps/dashboard/scripts/publish-build.ts")}`.quiet();
  await writeFile(PUBLISHED_STAMP, key);
};

/**
 * serve.js on the published build under systemd's own socket activation:
 * `systemd-socket-activate`, one `--listen` per address, each descriptor
 * named as its unit's `FileDescriptorName=` names it. Its output goes to `log`.
 */
export const serveUnder = (
  fleet: KitFleet,
  sockets: { address: string; name: string }[],
  log: string
) =>
  Bun.spawn(
    [
      "systemd-socket-activate",
      ...sockets.map(({ address }) => `--listen=${address}`),
      `--fdname=${sockets.map(({ name }) => name).join(":")}`,
      `--setenv=CAWCO_HUB_URL=${fleet.base}`,
      "node",
      join(ROOT, "apps/dashboard/serve.js"),
    ],
    {
      cwd: join(ROOT, "apps/dashboard"),
      env: { ...process.env, CAWCO_HUB_URL: fleet.base },
      stdout: Bun.file(log),
      stderr: Bun.file(`${log}.err`),
    }
  );
