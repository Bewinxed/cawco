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
 * (b) A spawn right behind a welcome's policy write waits on that write
 *     alone and answers the list it wrote, with the harness's own list and
 *     plan mode every session is denied (core `OWN_LIST_DENIED`); one on a
 *     machine that never wrote it is refused at once (a machine is online
 *     only once it has), where main waited 30 s.
 * (e) A welcome whose policy cannot be written (the Claude dir read-only):
 *     it fails in the agent's words, naming the file; the spawn behind it
 *     refuses at once with them; the hub (hub fleet-sync.ts) keeps that
 *     refusal on the machine's row in those words and does not mark it
 *     online, where main dropped it; and the dashboard's reading of the row
 *     (dashboard convergence.ts) gives the machine a notice row.
 * (c) A fleet marketplace whose ssh URL git refuses: the sync runs
 *     `claude plugin marketplace add` once, with the row's URL and no git
 *     config of its own, and the row's detail is git's own refusal. Main ran
 *     it a second time over anonymous https.
 * (d) Placement with every account it may run on at its 5-hour limit:
 *     refused, naming the account back first in the words the account
 *     surfaces use ("in 1h 30m") and its clock. Main started it on the
 *     pinned account "anyway".
 *
 *   bun scripts/probe-kit/run.ts fallback-refusals
 */
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  machineSync,
  syncNotice,
} from "../../../apps/dashboard/src/lib/cawco/convergence";
import {
  clockWords,
  type FleetSyncOutcome,
  OWN_LIST_DENIED,
} from "../../../packages/core/src/index";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { HOUR_MS } from "../../../packages/core/src/time";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { FleetSync } from "../../../packages/hub/src/fleet-sync";
import type { HubLifetimeShape } from "../../../packages/hub/src/lifetime";
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

/**
 * The hub's half of a refused welcome (hub fleet-sync.ts): a welcome sent,
 * then the agent's NACK in `said`, as session.ts `#control` answers it.
 * What the machine's row kept, and whether it was marked online.
 */
const welcomeRefused = (
  said: string
): { kept: FleetSyncOutcome[]; readied: boolean } => {
  const kept: FleetSyncOutcome[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sent: string[] = [];
  let readied = false;
  const fleetSync = new FleetSync({
    lifetime: {
      after: (ms, run) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        timers.add(timer);
        return timer;
      },
      cancel: (timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      },
    } as HubLifetimeShape,
    name: (machineId) => machineId,
    desired: () => new Map([["policy", { deniedTools: ["WebSearch"] }]]),
    generation: () => ({ generation: 0, fingerprint: null }),
    keepGeneration: () => undefined,
    send: (_, requestId) => {
      sent.push(requestId);
      return true;
    },
    ready: () => {
      readied = true;
    },
    keep: (_, next) => kept.push(next),
    keptItems: () => ({}),
    keepItems: () => undefined,
  });
  fleetSync.welcome("probe-machine", undefined);
  fleetSync.answered(sent[0] ?? "", {
    kind: "control_result",
    requestId: sent[0] ?? "",
    ok: false,
    error: said,
    refusal: { kind: "unknown", message: said },
  });
  fleetSync.gone("probe-machine");
  for (const timer of timers) {
    clearTimeout(timer);
  }
  return { kept, readied };
};

type Denials = { denied: string[] } | { refused: string };

const spec: Spec = {
  group: "The hub and machines",
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
  console.log(JSON.stringify({ denied: await sessionFleetDenials() }));
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

    // (b) A welcome's policy being written as a spawn reads: the spawn waits
    // on that write alone and answers its list.
    const fresh = await scratchHome();
    const b = await inHome<Denials & { waitedMs?: number }>(
      fresh,
      `import * as denials from ${JSON.stringify(join(AGENT, "denied-tools.ts"))};
const started = performance.now();
// What the agent does as a welcome arrives, a spawn right behind it.
const writing = denials.applyFleetDenials(["WebSearch"]);
try {
  const denied = await denials.sessionFleetDenials();
  await writing;
  console.log(JSON.stringify({ denied, waitedMs: Math.round(performance.now() - started) }));
} catch (error) {
  console.log(JSON.stringify({ refused: error instanceof Error ? error.message : String(error) }));
}`
    );
    check(
      "(b) a spawn behind a welcome's policy write answers the list it wrote, with the own-list set",
      "denied" in b &&
        JSON.stringify(b.denied) ===
          JSON.stringify(["WebSearch", ...OWN_LIST_DENIED]),
      JSON.stringify(b)
    );
    // (b) No policy ever written: refused at once, not after a wait.
    const never = await scratchHome();
    const bNever = await inHome<Denials & { waitedMs?: number }>(
      never,
      `import * as denials from ${JSON.stringify(join(AGENT, "denied-tools.ts"))};
const started = performance.now();
try {
  console.log(JSON.stringify({ denied: await denials.sessionFleetDenials() }));
} catch (error) {
  console.log(JSON.stringify({ refused: error instanceof Error ? error.message : String(error), waitedMs: Math.round(performance.now() - started) }));
}`
    );
    check(
      "(b) a spawn on a machine that never wrote the policy is refused at once, saying a machine is online only once it has",
      "refused" in bNever &&
        bNever.refused.includes("before the hub's welcome") &&
        (bNever.waitedMs ?? 99_999) < 1000,
      JSON.stringify(bNever)
    );

    // (e) A welcome whose policy cannot be written.
    const locked = await scratchHome();
    const claudeDir = projectClaudeDir(locked);
    await chmod(claudeDir, 0o500);
    const e = await inHome<{
      refused?: string;
      syncError?: string;
      waitedMs: number;
    }>(
      locked,
      `import * as denials from ${JSON.stringify(join(AGENT, "denied-tools.ts"))};
const started = performance.now();
let syncError;
const writing = denials.applyFleetDenials(["WebSearch"]).catch((error) => {
  syncError = error instanceof Error ? error.message : String(error);
});
const refused = await denials.sessionFleetDenials().then(
  () => undefined,
  (error) => error instanceof Error ? error.message : String(error)
);
await writing;
console.log(JSON.stringify({ syncError, refused, waitedMs: Math.round(performance.now() - started) }));`
    );
    await chmod(claudeDir, 0o700);
    const lockedSidecar = projectClaudeDir(locked, SIDECAR);
    check(
      "(e) a policy that cannot be written fails in the agent's words, naming the file",
      (e.syncError ?? "").startsWith(`could not write ${lockedSidecar}`),
      JSON.stringify(e)
    );
    check(
      "(e) the spawn behind it refuses at once, saying the policy the hub sent could not be written, and why",
      (e.refused ?? "").includes("could not be written") &&
        (e.refused ?? "").includes(e.syncError ?? "\u0000") &&
        e.waitedMs < 5000,
      JSON.stringify(e)
    );
    // That refusal as the agent answers its welcome (session.ts `#control`,
    // NACK), read by the hub (fleet-sync.ts): the row keeps it refused in
    // those words, the machine is not marked online, and the dashboard gives
    // it a notice row.
    const said = e.syncError ?? "";
    const { kept, readied } = welcomeRefused(said);
    const outcome = kept.at(-1);
    check(
      "(e) the hub's row keeps the welcome refused, in the agent's words, and the machine is not marked online",
      outcome?.state === "nacked" &&
        outcome.error === said &&
        said !== "" &&
        !readied,
      JSON.stringify({ kept, readied })
    );
    const notice = outcome
      ? syncNotice(machineSync({ fleetSync: outcome }), () => "1m")
      : null;
    check(
      `(e) the machine gets a notice row: ${notice}`,
      notice === "sync refused",
      String(notice)
    );

    // (c) A marketplace over an ssh URL git refuses.
    const cloning = await scratchHome();
    const bin = join(cloning, "bin");
    await mkdir(bin);
    const log = join(cloning, "claude.log");
    await writeFile(
      join(bin, "claude"),
      `#!${systemProgram("sh")}
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
  deniedTools: [],
  harnessConfig: [],
  hooks: [],
  hubOnlyMarketplaces: [],
  marketplaces: [{ name: "probe-market", source: ${JSON.stringify(source)} }],
  mcp: [],
  memory: null,
  placedMcp: [],
  placedMemory: [],
  placedSkills: [],
  pluginPayloads: [],
  plugins: [],
  skills: [],
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
    const later = now + 3 * HOUR_MS;
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
      atPlanLimit: "move",
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
      refusal.includes(`beta is back first, in 1h 30m (${clockWords(soon)})`),
      refusal
    );
  },
};

export default spec;
