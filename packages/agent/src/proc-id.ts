/** The process keeper's namespace. Infrastructure procs are never sessions. */
export const OPENCODE_SERVER_PROC_ID = "opencode-server";

export type ProcId =
  | { kind: "claude" | "pi"; instanceId: string }
  | { kind: "boundary"; id: string }
  | { kind: "opencode-server" };

export function procIdFor(
  kind: "claude" | "pi" | "boundary",
  id: string
): string {
  switch (kind) {
    case "claude":
      return id;
    case "pi":
      return `pi:${id}`;
    case "boundary":
      return `boundary-${id}`;
    default:
      return kind satisfies never;
  }
}

export function parseProcId(procId: string): ProcId {
  if (
    procId === OPENCODE_SERVER_PROC_ID ||
    procId.startsWith(`${OPENCODE_SERVER_PROC_ID}-`)
  ) {
    return { kind: "opencode-server" };
  }
  if (procId.startsWith("boundary-")) {
    return { kind: "boundary", id: procId.slice("boundary-".length) };
  }
  if (procId.startsWith("pi:")) {
    return { kind: "pi", instanceId: procId.slice(3) };
  }
  return { kind: "claude", instanceId: procId };
}
