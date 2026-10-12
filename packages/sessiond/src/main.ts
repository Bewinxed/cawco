/**
 * The sessiond entry point: endpoint, signals, exit. Everything else is in
 * `server.ts` — deliberately, so the process wrapper stays the only part a
 * future Windows port has to touch (design §11, §12).
 *
 * A build's keeper (keepers.ts) listens on an endpoint of its own beside the
 * machine's, and when the `keeper` link names its build (or there is none) it
 * makes the machine's endpoint name it: at the machine's start, and again
 * whenever its job restarts it. Its handover publishes it the first time.
 */

import { existsSync } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  readKeeperVersion,
  versionDirectory,
} from "@cawco/core/binary-installation";
import { detach } from "@cawco/core/detach";
import { keeperOf, MACHINE_ENDPOINT, publishKeeper } from "@cawco/core/keepers";
import { runtimeVersion, standalone } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import { placeChildren } from "./cgroup";
import { SessiondServer } from "./server";

/**
 * A build's keeper job names its build by its endpoint (`sessiond-<v>.sock`).
 * On macOS every keeper's job starts CawCo Agent.app, which holds the build
 * `current` names (core agent-bundle.ts); the job of another build's keeper
 * (the machine's keeper when a handover to the current build could not start
 * one, or a retiring keeper launchd starts again) runs its own build, from its
 * folder, in this same process. One whose folder is gone holds nothing and has
 * nothing to run, and exits 0, which launchd does not restart.
 */
const runOwnBuild = (endpoint: string): void => {
  const own = keeperOf(basename(endpoint));
  if (!standalone || own?.kind !== "build" || own.version === runtimeVersion) {
    return;
  }
  const build = join(versionDirectory(own.version), "cawco");
  if (!existsSync(build)) {
    console.log(
      `[sessiond] this job is ${own.version}'s keeper, and that build is no longer on this machine; it exits`
    );
    process.exit(0);
  }
  console.log(
    `[sessiond] this job is ${own.version}'s keeper; ${runtimeVersion} runs that build, ${build}`
  );
  if (!process.execve) {
    throw new Error(
      `[sessiond] ${runtimeVersion} has no process.execve to run ${build} with`
    );
  }
  process.execve(build, [build, "sessiond"], process.env);
};

const main = async (): Promise<void> => {
  // Read directly: `CAWCO_ENV` has no key for sessiond's own override.
  const endpoint = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();
  runOwnBuild(endpoint);
  // The machine's endpoint as a symlink is a build's keeper's: one started on
  // it (a legacy keeper's unit, restarted after its keeper was retired) would
  // take it over, or refuse it again every two seconds. Nothing here is
  // wanted, and an exit of 0 is not restarted.
  if ((await lstat(endpoint).catch(() => undefined))?.isSymbolicLink()) {
    console.log(
      `[sessiond] ${endpoint} names the keeper at ${await readlink(endpoint)}; this keeper is not wanted, and exits`
    );
    process.exit(0);
  }
  // Linux only: macOS has no cgroups, and limits threads per process, so the
  // children there cannot take the keeper's.
  const placement =
    process.platform === "linux" ? await placeChildren() : undefined;
  if (placement) {
    console.log(`[sessiond] ${placement.said}`);
  }
  const server = new SessiondServer({
    build: { version: runtimeVersion, startedAt: Date.now() },
    ...(placement?.children ? { children: placement.children.procs } : {}),
  });
  await server.listen(endpoint);
  console.log(
    `[sessiond] ${runtimeVersion} listening on ${endpoint} epoch=${server.epoch}`
  );
  // No `keeper` link: no binary install to say another build's keeper is the
  // machine's, so this one is.
  if (
    basename(endpoint) !== MACHINE_ENDPOINT &&
    ((await readKeeperVersion()) ?? runtimeVersion) === runtimeVersion
  ) {
    await publishKeeper(endpoint).then(
      () =>
        console.log(
          `[sessiond] ${join(dirname(endpoint), MACHINE_ENDPOINT)} names this keeper`
        ),
      (error: unknown) =>
        console.error(
          `[sessiond] not the machine's keeper yet: ${error instanceof Error ? error.message : String(error)}`
        )
    );
  }

  let draining = false;
  // §11: the handlers do nothing but call the plain drain function. The
  // Windows port wires console ctrl events to the same call.
  const shutdown = async (signal: string): Promise<void> => {
    if (draining) {
      return;
    }
    draining = true;
    console.log(`[sessiond] ${signal} — draining children`);
    await server.drain();
    await server.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => detach(shutdown("SIGTERM"), "sessiond drain"));
  process.on("SIGINT", () => detach(shutdown("SIGINT"), "sessiond drain"));
};

await main();
