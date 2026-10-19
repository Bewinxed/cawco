/**
 * Where a machine or the hub used to guess an answer and go on, it now
 * refuses with the cause, or waits for the real answer. Each leg drives the
 * real module: the agent's in a bun process of its own with a scratch HOME
 * (its paths are read off the home directory), the hub's placement in
 * process. No fleet, no boundary, so it runs inside a workspace.
 *
 * (a) A corrupt fleet sidecar (`~/.claude/cawco-fleet.json`): a session's
 *     denials (agent denied-tools.ts `sessionFleetDenials`, which every
 *     harness's spawn reads) refuse with the parse error and the file's
 *     path. Main answered the compiled four names.
 * (b) A machine with no sidecar yet: the spawn's denials wait for the first
 *     fleet sync and answer the list it wrote. Main answered the compiled
 *     four names at once.
 * (c) A fleet marketplace whose ssh URL git refuses: the sync runs
 *     `claude plugin marketplace add` once, with the row's URL and no git
 *     config of its own, and the row's detail is git's own refusal. Main ran
 *     it a second time over anonymous https.
 * (d) Placement with every account it may run on at its 5-hour limit:
 *     refused, naming the account back first in the words the account
 *     surfaces use ("resets in 1h 30m") and its clock. Main started it on
 *     the pinned account "anyway".
 *
 *   bun scripts/probe-kit/run.ts fallback-refusals
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { clockWords } from "../../../packages/core/src/index";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import {
  type PlacementInput,
  place,
} from "../../../packages/hub/src/placement";
import type { Spec } from "../kit";

const ROOT = join(import.meta.dir, "../../..");
const AGENT = join(ROOT, "packages/agent/src");
/** The fleet sidecar, under a home's Claude dir (agent denied-tools.ts). */
const SIDECAR = "cawco-fleet.json";

/** Runs `script` in its own bun with HOME at `home`, and answers the JSON its last line prints. */
const inHome = async <T>(
  home: string,
  script: string,
  env: Record<string, string> = {}
): Promise<T> => {
  const file = join(home, "leg.ts");
  await writeFile(file, script);
  const ran = await Bun.$`bun ${file}`
    .env({ ...process.env, HOME: home, CLAUDE_CONFIG_DIR: "", ...env })
    .quiet()
    .nothrow();
  const last = ran.stdout.toString().trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(last) as T;
  } catch (error) {
    throw new Error(
      `the leg printed no answer (exit ${ran.exitCode}): ${ran.stderr.toString().slice(-600)}`,
      { cause: error }
    );
  }
};

const scratchHome = async (): Promise<string> => {
  const home = await mkdtemp(
    join(process.env.TMPDIR ?? "/tmp", "fallback-refusals-")
  );
  await mkdir(projectClaudeDir(home), { recursive: true });
  return home;
};

type Denials = { denied: string[] } | { refused: string };

const spec: Spec = {
  name: "fallback-refusals",
  async run(kit) {
    const { check } = kit;

    // (a) A corrupt sidecar.
    const corrupt = await scratchHome();
    const sidecar = projectClaudeDir(corrupt, SIDECAR);
    await writeFile(sidecar, '{ "deniedTools": [');
    const a = await inHome<Denials>(
      corrupt,
      `import { sessionFleetDenials } from ${JSON.stringify(join(AGENT, "denied-tools.ts"))};
try {
  console.log(JSON.stringify({ denied: await sessionFleetDenials(false) }));
} catch (error) {
  console.log(JSON.stringify({ refused: error instanceof Error ? error.message : String(error) }));
}`
    );
    check(
      "(a) a corrupt fleet sidecar refuses the spawn's denials, naming the parse error and the file",
      "refused" in a &&
        a.refused.includes("could not parse") &&
        a.refused.includes(sidecar),
      JSON.stringify(a)
    );

    // (b) No sidecar yet: the first sync's list, once it lands.
    const fresh = await scratchHome();
    const b = await inHome<Denials & { waitedMs?: number }>(
      fresh,
      `import { writeFile } from "node:fs/promises";
import * as denials from ${JSON.stringify(join(AGENT, "denied-tools.ts"))};
const started = performance.now();
const asked = denials.sessionFleetDenials(false);
setTimeout(async () => {
  await writeFile(${JSON.stringify(projectClaudeDir(fresh, SIDECAR))}, JSON.stringify({ deniedTools: ["WebSearch"] }));
  // What the fleet sync calls once it has written the sidecar (absent on main).
  (denials as { fleetDenialsSynced?: () => void }).fleetDenialsSynced?.();
}, 300);
try {
  const denied = await asked;
  console.log(JSON.stringify({ denied, waitedMs: Math.round(performance.now() - started) }));
} catch (error) {
  console.log(JSON.stringify({ refused: error instanceof Error ? error.message : String(error) }));
}`
    );
    check(
      "(b) a machine that never synced waits for its first sync and answers the list it wrote",
      "denied" in b &&
        JSON.stringify(b.denied) === JSON.stringify(["WebSearch"]) &&
        (b.waitedMs ?? 0) >= 250,
      JSON.stringify(b)
    );

    // (c) A marketplace over an ssh URL git refuses.
    const cloning = await scratchHome();
    const bin = join(cloning, "bin");
    await mkdir(bin);
    const log = join(cloning, "claude.log");
    await writeFile(
      join(bin, "claude"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.400 (Claude Code)"; exit 0; fi
echo "$* GIT_CONFIG_COUNT=\${GIT_CONFIG_COUNT:-}" >> ${JSON.stringify(log)}
echo "git@github.com: Permission denied (publickey)." >&2
echo "fatal: Could not read from remote repository." >&2
exit 128
`,
      { mode: 0o755 }
    );
    const source = "git@github.com:probe-owner/probe-market.git";
    const c = await inHome<{ detail?: string; state?: string }>(
      cloning,
      `import { syncFleetConfig } from ${JSON.stringify(join(AGENT, "fleet.ts"))};
const report = await syncFleetConfig({
  mcp: [],
  marketplaces: [{ name: "probe-market", source: ${JSON.stringify(source)} }],
  plugins: [],
  deniedTools: [],
});
console.log(JSON.stringify(report.marketplaces["probe-market"] ?? {}));
process.exit(0);`,
      { PATH: `${bin}:${process.env.PATH ?? ""}` }
    );
    const adds = (
      await Bun.file(log)
        .text()
        .catch(() => "")
    )
      .split("\n")
      .filter((line) => line.startsWith("plugin marketplace add"));
    // The child's git config is the environment it inherited (a workspace
    // boundary keeps its own); main's retry put CawCo's https rewrite there.
    const inherited = process.env.GIT_CONFIG_COUNT ?? "";
    check(
      "(c) a refused ssh clone runs once, with the fleet row's URL and no git config of CawCo's",
      adds.length === 1 &&
        adds[0] ===
          `plugin marketplace add ${source} GIT_CONFIG_COUNT=${inherited}`,
      JSON.stringify(adds)
    );
    check(
      "(c) the marketplace's row says git's own refusal",
      c.state === "failed" &&
        (c.detail ?? "").includes("Permission denied (publickey)"),
      JSON.stringify(c)
    );

    // (d) Every account at its limit.
    const now = Date.parse("2026-10-18T12:00:00Z");
    const soon = now + 90 * 60_000;
    const later = now + 3 * 3_600_000;
    const account = (id: string, order: number) => ({
      id,
      order,
      createdAt: order,
      provider: "claude",
      kind: "subscription",
      label: id,
      email: `${id}@example.com`,
      identity: null,
      hue: "blue",
      neverBackup: false,
      reservePct: null,
    });
    const spent = (accountId: string, resetsAt: number) => ({
      accountId,
      lastSeenAt: now,
      overage: null,
      subscription: "max",
      windows: [
        {
          kind: "session",
          percent: 100,
          resetsAt: new Date(resetsAt).toISOString(),
          scopeLabel: null,
        },
      ],
    });
    const machine = "probe-machine";
    const input = {
      accounts: [account("alpha", 0), account("beta", 1)],
      signins: ["alpha", "beta"].map((accountId) => ({
        accountId,
        machineId: machine,
        state: "signed-in",
        movedAt: null,
        movedFrom: null,
      })),
      readings: [spent("alpha", later), spent("beta", soon)],
      bench: [],
      routing: {
        provider: "claude",
        yours: { strategy: "pinned", pinnedAccountId: "alpha" },
        delegates: { strategy: "fill-first" },
        atLimit: {},
      },
      kind: "yours",
      machineId: machine,
      machineName: machine,
      now,
    } as unknown as PlacementInput;
    const placed = place(input);
    const refusal = placed.ok ? "" : placed.refusal;
    check(
      "(d) with every account at its limit, placement refuses and starts nothing",
      !placed.ok,
      JSON.stringify(placed)
    );
    check(
      "(d) the refusal names the account back first and when, as the account surfaces say a reset",
      refusal.includes(`beta resets in 1h 30m (${clockWords(soon)})`),
      refusal
    );
  },
};

export default spec;
