/**
 * A scratch fleet leaves no process behind, whatever its sessions start.
 *
 * A session started in a checkout of this repository loads the checkout's
 * `.mcp.json`: its playwriter server (`npx playwriter@latest`,
 * PLAYWRITER_AUTO_ENABLE=1) starts a `playwriter-ws-server` in a session of
 * its own (`setsid`: its own process group). Once the server above it ends
 * it is re-parented to the nearest subreaper, so neither a tree nor a group
 * the fleet's services lead holds it, and one outlived its fleet with the
 * fleet's HOME in its environment; the kit's browser-leftovers check tracks
 * only the kit's own Chromium. The fleet's teardown ends every process whose
 * environment names one of its folders (scratch-fleet.ts `endCarriers`).
 *
 * 1. One Claude session is started in this checkout and given a turn, and
 *    the checkout's playwriter server and its ws-server run under the fleet
 *    (the leak's ground). Into a fresh HOME, `npx` installs playwriter
 *    (116 MB) from the registry first, about a minute and at times past
 *    three: so the fleet's HOME is seeded first with the install the host's
 *    npm cache holds (`_npx/<hash>`, the hash of the package spec, so the
 *    same in every cache; made there once with `npm exec` when it holds
 *    none), and `npx` only asks the registry which version is latest. This
 *    leg is the scenario, not the proof: what of it ran is a NOTE, never a
 *    FAIL. The session is stopped, as a person stops it, and what of
 *    playwriter is still under the fleet then is noted: whether the
 *    ws-server outlives its server is a race of its own.
 * 2. So the escape is made sure of too: a process started in the fleet's
 *    environment through `setsid` in a shell that exits at once, as the
 *    ws-server leaves, in no tree or group of the fleet's.
 * 3. The fleet is torn down: no process carries its HOME or sandbox in its
 *    environment.
 *
 *   bun scripts/probe-kit/run.ts fleet-leaves-nothing
 */
import { existsSync } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { carrying, until } from "../../scratch-fleet";
import { ROOT, type Spec } from "../kit";

/** The checkout's server, as its `.mcp.json` names it to `npx`. */
const PLAYWRITER = "playwriter@latest";

/** The host's npm cache: where `npx` keeps its installs, `_npx/<hash>`. */
const HOST_NPM_CACHE = process.env.npm_config_cache ?? join(homedir(), ".npm");

/** The host cache's `_npx` install that holds playwriter, if any. */
const hostInstall = async (): Promise<string | undefined> => {
  const root = join(HOST_NPM_CACHE, "_npx");
  for (const hash of await readdir(root).catch(() => [] as string[])) {
    if (existsSync(join(root, hash, "node_modules", "playwriter"))) {
      return join(root, hash);
    }
  }
  return undefined;
};

/**
 * The host's playwriter install, made there once when the cache holds none
 * (`npm exec` installs it and runs `true`, no server); undefined, with npm's
 * words, when it could not be made.
 */
const seedSource = async (): Promise<{ dir?: string; why: string }> => {
  const held = await hostInstall();
  if (held) {
    return { dir: held, why: `the host cache's ${held}` };
  }
  const made = await readWithin(300_000, async (signal) => {
    const child = Bun.spawn(
      ["npm", "exec", "--yes", `--package=${PLAYWRITER}`, "--", "true"],
      {
        env: { ...process.env, npm_config_cache: HOST_NPM_CACHE },
        stdout: "ignore",
        stderr: "pipe",
        signal,
      }
    );
    const [code, err] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);
    return `exited ${code}: ${err.trim().slice(-300) || "(no words)"}`;
  });
  const dir = await hostInstall();
  return dir
    ? { dir, why: `made in the host cache: ${dir}` }
    : {
        why: `npm exec ${PLAYWRITER} ${made.kind === "answered" ? made.value : `gave no answer within ${made.after} ms`}`,
      };
};

const spec: Spec = {
  name: "fleet-leaves-nothing",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const folders = [fleet.home, fleet.sandbox];
    const said = (list: { command: string; pid: number }[]) =>
      list.map((one) => `${one.pid} ${one.command}`).join("; ") || "none";

    // 1. The checkout's playwriter, under the fleet, from the seeded install.
    const source = await seedSource();
    if (source.dir) {
      const hash = source.dir.split("/").at(-1) as string;
      await cp(source.dir, join(fleet.home, ".npm", "_npx", hash), {
        recursive: true,
        verbatimSymlinks: true,
      });
    }
    kit.note(`playwriter's install: ${source.why}`);
    const started = performance.now();
    const id = await fleet.spawn("claude", "In the checkout", ROOT);
    await fleet.send(id, `Checkout turn ${crypto.randomUUID()}`);
    const playwriter = async () =>
      (await carrying(folders)).filter((one) =>
        one.command.includes("playwriter")
      );
    const ran = await until(
      "the checkout's playwriter ws-server, under the fleet",
      playwriter,
      (list) => list.some((one) => one.command.includes("ws-server")),
      60_000
    ).catch(playwriter);
    const seconds = ((performance.now() - started) / 1000).toFixed(0);
    kit.note(
      ran.some((one) => one.command.includes("ws-server"))
        ? `the checkout's playwriter server and its ws-server ran under the fleet, ${seconds}s after the spawn: ${said(ran)}`
        : `the checkout's playwriter ws-server did not start within ${seconds}s (the escape below proves the teardown alone): ${said(ran)}`
    );
    await fleet.stopSession(id);
    const outlived = await until(
      "the session's playwriter server gone with it",
      playwriter,
      (list) => !list.some((one) => one.command.includes("npm exec")),
      60_000
    ).catch(playwriter);
    kit.note(`after the session's stop, under the fleet: ${said(outlived)}`);

    // 2. An escape for sure: setsid, its shell gone at once.
    await Bun.spawn(
      ["sh", "-c", "setsid sleep 600 </dev/null >/dev/null 2>&1 &"],
      { env: fleet.env, cwd: fleet.workdir }
    ).exited;
    const escaped = await until(
      "the escaped process, under the fleet",
      async () =>
        (await carrying(folders)).filter((one) =>
          one.command.startsWith("sleep 600")
        ),
      (list) => list.length > 0,
      10_000
    ).catch(() => []);
    check(
      "a process started through setsid in the fleet's environment runs outside its trees",
      escaped.length > 0,
      said(escaped)
    );

    // 3. Down: nothing left.
    await fleet.close();
    const left = await carrying(folders);
    check(
      "once the fleet is down, no process carries its HOME or sandbox in its environment",
      left.length === 0,
      said(left)
    );
  },
};

export default spec;
