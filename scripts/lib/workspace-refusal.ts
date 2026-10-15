/**
 * What a CawCo workspace's boundary denies that a probe may need, and the
 * one refusal a probe makes for it before it starts anything: a probe run
 * in a workspace otherwise waits out a slot and a build, then fails on a
 * reason its output hides ("the question card on screen: not within 120s").
 *
 *   refuseInWorkspace("probe-sealed-secrets.ts", ["pty"]);
 *
 * Each need is named with the error that shows the boundary denying it,
 * each measured from a workspace on the Mac (2026-10-15).
 */

/** What the boundary denies, in the words the refusal prints. */
const DENIED = {
  /** Python's pty.fork, as a probe types at a CLI's hidden prompt. */
  pty: 'a pseudo-terminal (Python\'s pty.fork: "OSError: out of pty devices")',
  /**
   * axe driving an iOS 27 simulator: its automation socket. axe reaches an
   * iOS 18.5 or 26.0 simulator from a workspace (axeRefused).
   */
  axe: 'axe on an iOS 27 simulator (its automation socket: "Failed to connect to unix domain socket at path …/com.apple.testmanagerd.remote-automation.uds: 1 Operation not permitted")',
  /** A scratch fleet's delegate: the agent links its TMPDIR under /private/tmp/cawco-<uid>. */
  delegate:
    'a scratch fleet\'s delegate (its TMPDIR link under /private/tmp/cawco-<uid>: "EPERM: operation not permitted, symlink …")',
} as const;

export type Denied = keyof typeof DENIED;

/** Why `probe` cannot run in this process's CawCo workspace, or nothing outside one or when it needs nothing denied. */
export const workspaceRefusal = (
  probe: string,
  needs: Denied[]
): string | undefined => {
  if (!process.env.CAWCO_WORKSPACE || needs.length === 0) {
    return;
  }
  return `${probe} needs ${needs.map((need) => DENIED[need]).join(", and ")}, which a CawCo workspace's boundary denies. Run it from the orchestrator's shell on the Mac, or a person's.`;
};

/** A standalone probe's refusal: exits 2 with workspaceRefusal's sentence in a workspace. */
export const refuseInWorkspace = (probe: string, needs: Denied[]): void => {
  const why = workspaceRefusal(probe, needs);
  if (why) {
    console.error(why);
    process.exit(2);
  }
};

const IOS_MAJOR = /\.iOS-(\d+)-\d+$/;
/** An iOS runtime identifier's major and minor version. */
const IOS_VERSION = /iOS-(\d+)-(\d+)$/;

/** The newest installed iOS simulator runtime's identifier, as `newest` slot choices resolve to. */
const newestRuntime = (): string | undefined => {
  const listed = Bun.spawnSync(["xcrun", "simctl", "list", "runtimes", "-j"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (listed.exitCode !== 0) {
    return;
  }
  const { runtimes } = JSON.parse(listed.stdout.toString()) as {
    runtimes: { identifier: string; isAvailable: boolean }[];
  };
  return runtimes
    .filter((r) => r.isAvailable && IOS_MAJOR.test(r.identifier))
    .map((r) => r.identifier)
    .sort((a, b) => {
      const [, ma = "0", na = "0"] = a.match(IOS_VERSION) ?? [];
      const [, mb = "0", nb = "0"] = b.match(IOS_VERSION) ?? [];
      return Number(ma) - Number(mb) || Number(na) - Number(nb);
    })
    .at(-1);
};

/**
 * Whether axe is refused on a simulator of `runtime` (an identifier, as
 * com.apple.CoreSimulator.SimRuntime.iOS-27-2) from a workspace: iOS 27 and
 * on. No runtime: the newest installed, as a `newest` slot choice takes.
 * Unknown: refused.
 */
export const axeRefused = (runtime?: string): boolean => {
  const major = (runtime ?? newestRuntime())?.match(IOS_MAJOR)?.[1];
  return major === undefined || Number(major) >= 27;
};
