/**
 * A booted iOS Simulator in one of the Mac's two simulator slots
 * (apps/apple/scripts/mac-slot.sh, apps/apple/README.md "The Mac's slots").
 * Every probe that needs a simulator takes it here: the Mac holds at most two
 * booted machine-wide, and each is deleted when its holder ends, however it
 * ends.
 *
 *   const sim = await macSim({ runtime: IOS_18_5, device: "iPhone 16 Pro" });
 *   … xcrun simctl install ${sim.udid} …
 *   await sim.release();
 *
 * It runs `mac-slot.sh sim [--runtime …] [--device …] -- <holder>`, on the
 * Mac itself or over `ssh mac` from Linux. The holder prints
 * $CAWCO_SIM_UDID and then reads its stdin, which is this process's pipe:
 * `release()` closes it, and so does this process dying, so the slot's
 * keeper shuts the simulator down, deletes it and frees the slot either way.
 * `release()` resolves once that is done.
 *
 * Over SSH the slot script is build-both.sh's copy of apps/apple on the Mac
 * (~/build/cawco-apple/<build>/apps/apple), so a probe compiles first.
 */
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..", "..");
const home = process.env.HOME ?? "";
const SSH = [
  "ssh",
  "-F",
  join(home, ".ssh", "config"),
  "-o",
  "BatchMode=yes",
  "-o",
  "ServerAliveInterval=15",
  "-o",
  "ServerAliveCountMax=3",
  "mac",
];
const UDID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const TYPE_ID = "com.apple.CoreSimulator.SimDeviceType.";
/** The command the slot runs: says the UDID, then holds until its stdin ends. */
const HOLDER = 'echo "$CAWCO_SIM_UDID"; exec cat >/dev/null';

export interface SimChoice {
  /**
   * Device type: an identifier (com.apple.CoreSimulator.SimDeviceType.…) or
   * its name ("iPhone 16 Pro"). Unset with `runtime` unset too: mac-slot.sh's
   * pick, the newest iPhone Pro on a runtime that meets project.yml's target.
   */
  device?: string;
  /**
   * In place of `runtime` and `device`: the newest iOS runtime's available
   * device whose name matches this (Python) pattern, as `iPhone \d+ Pro`.
   */
  newest?: string;
  /** Runtime identifier, as com.apple.CoreSimulator.SimRuntime.iOS-18-5. */
  runtime?: string;
  /** Reach the Mac over `ssh mac`. Default: when not on the Mac itself. */
  ssh?: boolean;
}

export interface MacSim {
  /** Ends the slot: the simulator shut down and deleted, the slot freed. */
  release: () => Promise<void>;
  udid: string;
}

const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/** argv that runs `words` on the Mac: here, or as one command line over ssh. */
const onMac = (ssh: boolean, words: string[]) =>
  ssh ? [...SSH, words.map(quote).join(" ")] : words;

/** The runtime and device type `choice` names, as identifiers. */
async function resolveChoice(
  ssh: boolean,
  choice: SimChoice
): Promise<{ device?: string; runtime?: string }> {
  const named = choice.device && !choice.device.startsWith(TYPE_ID);
  if (!(choice.newest || named)) {
    return { runtime: choice.runtime, device: choice.device };
  }
  const child = Bun.spawn(
    onMac(ssh, [
      "/usr/bin/python3",
      "-I",
      "-c",
      `
import json, re, subprocess, sys
newest, name, runtime = sys.argv[1:4]
listed = json.loads(subprocess.run(["xcrun", "simctl", "list", "-j"], capture_output=True, text=True, check=True).stdout)
if newest:
    best = None
    for rt, devices in listed["devices"].items():
        m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", rt)
        if not m:
            continue
        for d in devices:
            if d.get("isAvailable") and re.fullmatch(newest, d["name"]):
                key = (int(m[1]), int(m[2]), d["name"])
                if best is None or key > best[0]:
                    best = (key, rt, d["deviceTypeIdentifier"])
    if best is None:
        sys.exit("no available simulator matching " + newest)
    print(best[1], best[2])
else:
    kind = next((t["identifier"] for t in listed["devicetypes"] if t["name"] == name), None)
    if kind is None:
        sys.exit("no simulator device type named " + name)
    print(runtime, kind)
`,
      choice.newest ?? "",
      choice.device ?? "",
      choice.runtime ?? "",
    ]),
    { stdout: "pipe", stderr: "pipe" }
  );
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`simulator choice exited ${code}: ${err.trim()}`);
  }
  const [runtime, device] = text.trim().split(" ");
  return { runtime: runtime || undefined, device };
}

/** Where mac-slot.sh is on the side that runs it. */
function slotScript(ssh: boolean): string {
  if (!ssh) {
    return join(root, "apps", "apple", "scripts", "mac-slot.sh");
  }
  const build = root === join(home, "cockpit") ? "main" : basename(root);
  return `build/cawco-apple/${build}/apps/apple/scripts/mac-slot.sh`;
}

/** Takes a simulator slot (waiting for one, as mac-slot.sh prints); the booted simulator's UDID. */
export async function macSim(choice: SimChoice = {}): Promise<MacSim> {
  const ssh = choice.ssh ?? process.platform !== "darwin";
  const { runtime, device } = await resolveChoice(ssh, choice);
  const child = Bun.spawn(
    onMac(ssh, [
      "bash",
      slotScript(ssh),
      "sim",
      ...(runtime ? ["--runtime", runtime] : []),
      ...(device ? ["--device", device] : []),
      "--",
      "sh",
      "-c",
      HOLDER,
    ]),
    // stderr carries mac-slot.sh's WAITING and SIMULATOR lines.
    { stdin: "pipe", stdout: "pipe", stderr: "inherit" }
  );
  let released: Promise<void> | undefined;
  const release = () => {
    released ??= (async () => {
      child.stdin.end();
      await child.exited;
    })();
    return released;
  };
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n")) {
    // biome-ignore lint/performance/noAwaitInLoops: one stream, read in order up to its first line
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  reader.releaseLock();
  const udid = text.split("\n")[0]?.trim() ?? "";
  if (!UDID.test(udid)) {
    await release();
    throw new Error(
      `mac-slot.sh sim gave no simulator (exit ${child.exitCode}): ${text.trim() || "no output"}`
    );
  }
  return { udid, release };
}
