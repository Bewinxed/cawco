/**
 * Who a process is, beyond its number: a process id is reused, so a record that
 * names one is only as good as the start time it was written with. A marker
 * naming a process counts as live only if that process is still running, was
 * started when the marker says, and the machine has not rebooted since.
 *
 * Every reading is asynchronous. On macOS they run `ps` and `sysctl`, and a
 * synchronous spawn under Bun waits on a private event loop whose handle swap
 * misplaces polls of the process's own loop (oven-sh/bun#34069, fix open as
 * oven-sh/bun#40078): the session keeper sat wedged on one for 35 minutes.
 */
import { readFile } from "node:fs/promises";

const output = async (argv: string[]): Promise<string | undefined> => {
  const ran = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore" });
  const [text, code] = await Promise.all([
    new Response(ran.stdout).text(),
    ran.exited,
  ]);
  const trimmed = text.trim();
  return code === 0 && trimmed ? trimmed : undefined;
};

/** When the process started, as the system reports it, or undefined when there is no such process. */
export async function processStart(pid: number): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      // After the parenthesised name, the fields run from the third; the start time is the 22nd.
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    } catch {
      return undefined;
    }
  }
  return output(["ps", "-o", "lstart=", "-p", String(pid)]);
}

/** What identifies this boot of the machine. */
export async function bootId(): Promise<string | undefined> {
  if (process.platform === "linux") {
    try {
      return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
    } catch {
      return undefined;
    }
  }
  return output(["sysctl", "-n", "kern.boottime"]);
}

/** The identity of this very process, to be written into a marker. */
export async function ownIdentity(): Promise<{
  bootId?: string;
  pid: number;
  procStart?: string;
}> {
  const [start, boot] = await Promise.all([
    processStart(process.pid),
    bootId(),
  ]);
  return {
    pid: process.pid,
    ...(start ? { procStart: start } : {}),
    ...(boot ? { bootId: boot } : {}),
  };
}

/** Whether a marker's process is the one that wrote it and is still running. */
export async function markerIsLive(marker: {
  bootId?: string;
  pid?: number;
  procStart?: string;
}): Promise<boolean> {
  if (marker.pid === undefined || marker.procStart === undefined) {
    return false;
  }
  const [start, boot] = await Promise.all([processStart(marker.pid), bootId()]);
  return start === marker.procStart && boot === marker.bootId;
}
