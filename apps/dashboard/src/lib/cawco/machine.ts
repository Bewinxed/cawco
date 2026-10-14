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
 * its existing login does not reach its agent. pi's and OpenCode's are their
 * reports' own words (`authReason`): pi's sign-in, OpenCode's server refusing
 * to start. Undefined when there is nothing to say.
 */
export function signInWarning(
  machine: AgentRow,
  harness: "claude" | "pi" | "opencode" = "claude"
): string | undefined {
  if (harness !== "claude") {
    return machine.harnesses?.find((report) => report.harness === harness)
      ?.authReason;
  }
  switch (machine.auth) {
    case "unreadable-credentials":
      return `${machineLabel(machine.hostname)} has Claude Code credentials it cannot read: they are in the login keychain, and its agent is running outside the desktop session. On that machine, run \`cawco service install\` — a LaunchAgent can read the keychain — or use Unlock keychain… in its menu.`;
    case "unauthenticated":
      return `No Claude account is signed in on ${machineLabel(machine.hostname)}, so sessions there will answer "Not logged in". Add one in Configure → Accounts and sign it in there.`;
    default:
      return undefined;
  }
}
