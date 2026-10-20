/**
 * A simulator slot whose keeper was killed outright keeps no simulator
 * (apps/apple/scripts/mac-slot.sh `reap_orphans`). A stopped delegate's
 * workspace ends everything it left with SIGKILL, a slot's keeper among
 * them, and a keeper killed so runs no EXIT trap: its slot's simulator stayed
 * until a keeper took that same slot again ("CawCo slot 1 (8466E2BB-…)
 * (Shutdown)", deleted by hand on 2026-10-20). The next mac-slot.sh to
 * start, of either kind, deletes it, once no live keeper holds that slot.
 *
 * The spec takes a real simulator slot (scripts/lib/mac-sim.ts), then:
 *
 * r1. While that slot's keeper lives, a `mac-slot.sh build` that starts
 *     deletes nothing of it: its simulator is still there.
 * r2. The keeper killed with SIGKILL and its caller then gone, the simulator
 *     is still there: nothing but a keeper deletes it.
 * r3. The next `mac-slot.sh build` to start deletes that simulator, and says
 *     so.
 *
 * Its own build runs run `true`, under this spec's heavy run. It kills only
 * the keeper of the slot it took, and deletes that slot's simulator itself if
 * a leg leaves it. macOS only.
 *
 *   bun scripts/probe-kit/run.ts mac-slot-reap
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal,
  signalGroup,
  spawnedPid,
} from "../../../packages/core/src/signal";
import { heavySlot } from "../../lib/heavy-run";
import { macSim } from "../../lib/mac-sim";
import type { Kit, Spec } from "../kit";

/** This checkout's mac-slot.sh. */
const SLOT_SCRIPT = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "apps",
  "apple",
  "scripts",
  "mac-slot.sh"
);
/** Where mac-slot.sh keeps its locks, each naming the pid of the keeper that holds it. */
const LOCKS = join(
  homedir(),
  ".cawco",
  "workspace-cache",
  "xdg",
  "cawco-apple.noindex",
  ".locks"
);
/** How long a build run of this spec is given to start, reap and end. */
const BUILD_MS = 120_000;
const SLOT_NAME = /^CawCo slot ([12])$/;

interface Device {
  name: string;
  state: string;
  udid: string;
}

/** Simulator `udid` as simctl lists it now, or nothing once it is gone. */
const device = async (udid: string): Promise<Device | undefined> => {
  const listed = await Bun.$`xcrun simctl list devices -j`.quiet();
  const all = JSON.parse(listed.stdout.toString()) as {
    devices: Record<string, Device[]>;
  };
  return Object.values(all.devices)
    .flat()
    .find((one) => one.udid === udid);
};

/**
 * One `mac-slot.sh build -- true`, in a group of its own: what it said on
 * stderr, and whether it ended within {@link BUILD_MS}. Its keeper reaps as
 * it starts, before it waits for the build slot; one still waiting then (a
 * real build holds the slot) is ended the runner's way.
 */
const buildRun = async (): Promise<{ ended: boolean; said: string }> => {
  const child = Bun.spawn(["bash", SLOT_SCRIPT, "build", "--", "true"], {
    env: { ...process.env, CAWCO_HEAVY_RUN_HELD: "1" },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    detached: true,
  });
  const group = spawnedPid(child);
  const said = new Response(child.stderr).text();
  const ended =
    (await readWithin(BUILD_MS, () => child.exited)).kind === "answered";
  if (!ended && group !== undefined) {
    signalGroup(group, "SIGTERM");
    await child.exited;
  }
  return { ended, said: (await said).trim() };
};

const deletedLine = (slot: string, udid: string): string =>
  `mac-slot: deleted simulator CawCo slot ${slot} ${udid}`;

const spec: Spec = {
  name: "mac-slot-reap",
  run: async (kit: Kit) => {
    if (process.platform !== "darwin") {
      kit.note(
        "mac-slot.sh's simulator slots are the Mac's: nothing to run on this machine"
      );
      return;
    }
    const { check } = kit;
    const heavy = await heavySlot();
    let udid = "";
    try {
      const sim = await macSim();
      ({ udid } = sim);
      const named = await device(udid);
      const slot = SLOT_NAME.exec(named?.name ?? "")?.[1];
      const keeper = slot
        ? Number.parseInt(
            await readFile(join(LOCKS, `sim-${slot}`), "utf8").catch(() => ""),
            10
          )
        : Number.NaN;
      const keeperLine = (await commandLines()).find(
        ({ pid }) => pid === keeper
      )?.command;
      const readable =
        slot !== undefined &&
        Number.isInteger(keeper) &&
        keeperLine?.includes("mac-slot-keeper sim") === true;
      if (!(readable && slot)) {
        check(
          "r1: while a slot's keeper lives, a build that starts deletes nothing of that slot",
          false,
          `the slot taken is not one this spec can read: simulator ${udid} is ${JSON.stringify(named)}, its slot's lock names pid ${keeper}, whose command is ${keeperLine ?? "not running"}`
        );
        await sim.release();
        return;
      }

      // r1
      const beside = await buildRun();
      const stillHeld = await device(udid);
      check(
        "r1: while a slot's keeper lives, a build that starts deletes nothing of that slot",
        stillHeld !== undefined &&
          !beside.said.includes(deletedLine(slot, udid)) &&
          isAlive(listedPid(keeper)),
        `simulator ${udid} (CawCo slot ${slot}, keeper pid ${keeper}): ${stillHeld ? stillHeld.state : "gone"}; the build ${beside.ended ? "ended" : "was still waiting and was ended"}, saying: ${beside.said || "nothing"}`
      );

      // r2
      const sent = signal(listedPid(keeper), "SIGKILL");
      await sim.release();
      const left = await device(udid);
      const lockNow = await readFile(join(LOCKS, `sim-${slot}`), "utf8").catch(
        () => "no lock"
      );
      check(
        "r2: its keeper killed with SIGKILL and its caller gone, the slot's simulator is still there",
        sent === "sent" && !isAlive(listedPid(keeper)) && left !== undefined,
        `SIGKILL to keeper ${keeper}: ${sent}; simulator ${udid}: ${left ? left.state : "gone"}; slot ${slot}'s lock: ${lockNow.trim()}`
      );

      // r3
      const next = await buildRun();
      const after = await device(udid);
      check(
        "r3: the next mac-slot.sh build to start deletes the simulator of the slot whose keeper was killed, and says so",
        after === undefined && next.said.includes(deletedLine(slot, udid)),
        `simulator ${udid}: ${after ? `still there, ${after.state}` : "gone"}; the build ${next.ended ? "ended" : "was still waiting and was ended"}, saying: ${next.said || "nothing"}`
      );
    } finally {
      // What a failing leg left of this spec's own slot.
      if (udid && (await device(udid).catch(() => undefined))) {
        await Bun.$`xcrun simctl shutdown ${udid}`.quiet().nothrow();
        await Bun.$`xcrun simctl delete ${udid}`.quiet().nothrow();
      }
      heavy.release();
    }
  },
};

export default spec;
