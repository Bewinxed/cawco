/**
 * One hub to a database (hub db-lock.ts), on a scratch fleet's real hub:
 *
 * 1. The fleet's hub up, `<db>.lock` names its process.
 * 2. A second hub on the same database (its own port) exits 1 within a
 *    minute, its stderr one sentence naming the first hub's pid and
 *    CAWCO_DB_PATH; the first hub still answers and still holds the lock.
 * 3. The first hub killed with SIGKILL (no cleanup runs), its lock left
 *    naming a dead process; a hub started again takes it over and answers,
 *    the lock naming the new process.
 * 4. The hub package's `start` script with no CAWCO_DB_PATH opens
 *    `$XDG_DATA_HOME/cawco-dev/cawco.db`, never the fleet's (it starts
 *    beside the fleet's hub, which keeps its lock).
 *
 *   bun scripts/probe-kit/run.ts hub-lock
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { freePortRange, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HUB_ENTRY = join(ROOT, "packages", "hub", "src", "index.ts");

interface Holder {
  pid?: number;
}

const holderOf = async (lock: string): Promise<Holder | undefined> =>
  JSON.parse(await readFile(lock, "utf8")) as Holder;

const alive = (pid: number | undefined): boolean => {
  if (pid === undefined) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A hub's own ports: one for its listener, the rest for its previews. */
const ports = async () => {
  const [first, last] = (await freePortRange(13)).split("-").map(Number) as [
    number,
    number,
  ];
  return {
    CAWCO_HUB_PORT: String(first),
    CAWCO_PREVIEW_PORTS: `${first + 1}-${last}`,
  };
};

const spec: Spec = {
  name: "hub-lock",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const db = fleet.env.CAWCO_DB_PATH as string;
    const lock = `${db}.lock`;

    // 1. The fleet's hub holds its database.
    const first = fleet.launch("hub");
    await fleet.hubUp();
    const held = await holderOf(lock);
    kit.check(
      "the running hub's lock names its process",
      held?.pid === first.pid,
      `lock pid ${held?.pid}, hub pid ${first.pid}`
    );

    // 2. A second hub on the same database is refused.
    const second = Bun.spawn([process.execPath, HUB_ENTRY], {
      cwd: ROOT,
      env: { ...fleet.env, ...(await ports()) },
      stdout: "ignore",
      stderr: "pipe",
    });
    const ended = await readWithin(60_000, () => second.exited);
    switch (ended.kind) {
      case "answered":
        kit.check(
          "a second hub on the same database exits 1",
          ended.value === 1,
          `exit ${ended.value}`
        );
        break;
      case "unanswered":
        second.kill("SIGKILL");
        kit.check(
          "a second hub on the same database exits 1",
          false,
          `it did not exit within ${ended.after} ms`
        );
        break;
      default: {
        const unhandled: never = ended;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    const said = await new Response(second.stderr).text();
    kit.check(
      "its refusal names the holding hub's pid and CAWCO_DB_PATH",
      said.includes(`is held by the hub in process ${first.pid}`) &&
        said.includes("CAWCO_DB_PATH"),
      said.trim().split("\n").at(-1) ?? ""
    );
    const answers = await fetch(`${fleet.base}/health`).then((r) => r.ok);
    kit.check(
      "the first hub still answers and still holds the lock",
      answers && (await holderOf(lock))?.pid === first.pid,
      `health ${answers}, lock pid ${(await holderOf(lock))?.pid}`
    );

    // 3. A killed hub's lock is taken over by the next.
    await fleet.stop("hub", "SIGKILL");
    const stale = await holderOf(lock);
    kit.check(
      "a hub killed with SIGKILL leaves its lock naming a dead process",
      stale?.pid === first.pid && !alive(stale?.pid),
      `lock pid ${stale?.pid}, alive ${alive(stale?.pid)}`
    );
    const next = fleet.launch("hub");
    await fleet.hubUp();
    const taken = await holderOf(lock);
    kit.check(
      "the next hub takes the stale lock over and answers",
      taken?.pid === next.pid,
      `lock pid ${taken?.pid}, hub pid ${next.pid}`
    );

    // 4. The package's start script, with no CAWCO_DB_PATH, opens the dev database.
    const { CAWCO_DB_PATH: _db, ...unset } = fleet.env;
    const devLock = join(
      fleet.env.XDG_DATA_HOME as string,
      "cawco-dev",
      "cawco.db.lock"
    );
    const started = Bun.spawn(["bun", "run", "start"], {
      cwd: join(ROOT, "packages", "hub"),
      env: { ...unset, ...(await ports()) },
      stdout: "ignore",
      stderr: "pipe",
    });
    const startErr = new Response(started.stderr).text();
    try {
      const dev = await until(
        "the start script's hub holding the dev database",
        async () => (existsSync(devLock) ? await holderOf(devLock) : undefined),
        (holder) => alive(holder.pid),
        90_000
      );
      kit.check(
        "the start script with no CAWCO_DB_PATH opens $XDG_DATA_HOME/cawco-dev/cawco.db",
        alive(dev.pid),
        `${devLock} names live pid ${dev.pid}`
      );
      kit.check(
        "the fleet's hub keeps its own database meanwhile",
        (await holderOf(lock))?.pid === next.pid,
        `lock pid ${(await holderOf(lock))?.pid}`
      );
      if (dev.pid) {
        process.kill(dev.pid, "SIGKILL");
      }
    } finally {
      started.kill("SIGKILL");
      await started.exited;
      kit.note(`start script's stderr: ${(await startErr).slice(-600)}`);
    }
  },
};

export default spec;
