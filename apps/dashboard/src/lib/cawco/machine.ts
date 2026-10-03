/** How a machine names itself vs. how the rail should say it out loud. */
import { type AgentRow, machineLabel } from "@cawco/core";

/**
 * Splits the daemon's `platform-arch` fingerprint into something readable.
 * The platform is Node's `process.platform`, so it is a fixed vocabulary.
 * Words only — the mark for the same fingerprint is `OsMark`, and one machine
 * is named the same way everywhere.
 */
export function machineOs(os: string) {
  const [platform = "", arch = ""] = os.trim().toLowerCase().split("-");

  switch (platform) {
    case "darwin":
      return { label: "macOS", arch };
    case "linux":
      return { label: "Linux", arch };
    case "win32":
    case "windows":
      return { label: "Windows", arch };
    default:
      return { label: "Unknown", arch };
  }
}

/**
 * Why a machine cannot start a session, in the words the person looking at the
 * rail needs — which is the remedy, on which machine, and for the macOS case why
 * signing in again is not it. Undefined when there is nothing to say.
 */
export function signInWarning(
  machine: AgentRow,
  harness: "claude" | "pi" = "claude"
): string | undefined {
  if (harness === "pi") {
    return machine.harnesses?.find((report) => report.harness === "pi")
      ?.authReason;
  }
  switch (machine.auth) {
    case "unreadable-credentials":
      return `${machineLabel(machine.hostname)} has Claude Code credentials it cannot read: they are in the login keychain, and its agent is running outside the desktop session. Signing in again will not help. On that machine, run \`cawco service install\` — a LaunchAgent can read the keychain — or \`cawco login\` for a token.`;
    case "unauthenticated":
      return `Nobody is signed in to Claude Code on ${machineLabel(machine.hostname)}, so sessions there will answer "Not logged in". Run \`cawco login\` on that machine.`;
    default:
      return undefined;
  }
}
