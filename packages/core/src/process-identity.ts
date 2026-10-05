/**
 * Who a process is, beyond its number: a process id is reused, so a record that
 * names one is only as good as the start time it was written with. A marker
 * naming a process counts as live only if that process is still running, was
 * started when the marker says, and the machine has not rebooted since.
 */
import { readFileSync } from "node:fs";

/** When the process started, as the system reports it, or undefined when there is no such process. */
export function processStart(pid: number): string | undefined {
  if (process.platform === "linux") {
    try {
      // After the parenthesised name, the fields run from the third; the start time is the 22nd.
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    } catch {
      return undefined;
    }
  }
  const ran = Bun.spawnSync(["ps", "-o", "lstart=", "-p", String(pid)], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = ran.stdout.toString().trim();
  return ran.exitCode === 0 && text ? text : undefined;
}

/** What identifies this boot of the machine. */
export function bootId(): string | undefined {
  if (process.platform === "linux") {
    try {
      return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    } catch {
      return undefined;
    }
  }
  const ran = Bun.spawnSync(["sysctl", "-n", "kern.boottime"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  return ran.exitCode === 0 ? ran.stdout.toString().trim() : undefined;
}

/** The identity of this very process, to be written into a marker. */
export function ownIdentity(): {
  bootId?: string;
  pid: number;
  procStart?: string;
} {
  const start = processStart(process.pid);
  const boot = bootId();
  return {
    pid: process.pid,
    ...(start ? { procStart: start } : {}),
    ...(boot ? { bootId: boot } : {}),
  };
}

/** Whether a marker's process is the one that wrote it and is still running. */
export function markerIsLive(marker: {
  bootId?: string;
  pid?: number;
  procStart?: string;
}): boolean {
  if (marker.pid === undefined || marker.procStart === undefined) {
    return false;
  }
  return (
    processStart(marker.pid) === marker.procStart && bootId() === marker.bootId
  );
}
