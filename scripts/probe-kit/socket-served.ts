/**
 * The dashboard as the owner's machines run it: serve.js on the published
 * build, handed its listening sockets by systemd's own socket activation
 * (`systemd-socket-activate`), its `/ws` relay the raw-socket one in
 * front of the hub.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import type { KitFleet } from "./kit";
import { ROOT } from "./kit";

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
 * where serve.js reads it, `apps/dashboard/build`. A build of this tree an
 * earlier run already published leaves no `.build-next`: the kit builds
 * again only when the tree changed, so `build` is that build.
 */
export const publishBuild = async (): Promise<void> => {
  if (!existsSync(join(ROOT, "apps/dashboard/.build-next"))) {
    return;
  }
  await $`bun ${join(ROOT, "apps/dashboard/scripts/publish-build.ts")}`.quiet();
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
