/**
 * The upstream guard (core upstream-guard.ts, agent upstream-shim.ts, hub
 * upstream.ts): while the choice keeps agents off other people's
 * repositories, a write to one does not run, and the session reads why. On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: run it where a workspace boundary can
 * start (not inside another one).
 *
 * A fake `gh` first on the services' PATH records each call it runs, with
 * the GitHub token it ran with, in the workspace's TMPDIR; the boundary's
 * guard shim stands before it. On the host it is the agent's gh too, whose
 * `gh auth token` answers `probe-host-token`. The services run with a
 * caller's `GH_TOKEN` (`probe-caller-token`), as a person's shell may. The
 * project is a checkout with no origin of its own, so the hub is its remote
 * and a workspace's push goes through the workspace's git door, as it does
 * for every project whose remote is the hub. (A clone keeps its source's
 * own origin, clone.ts, and a local path outside the clone is no origin a
 * boundary can write, guarded or not.) Its remote is recorded as
 * github.com/probe-owner/probe-repo, as a GitHub checkout's would be.
 *
 * (a) A new fleet has no answer and a new project inherits: GET
 *     /api/fleet/choices says `upstream: null`, the project
 *     `upstreamPosts: null`. PUT `upstream: false` ("Keep agents off other
 *     repositories") answers it.
 * (b) One delegate of the project, its workspace's rule guarded (the
 *     project inherits the fleet's answer), runs in turn:
 *     A `gh issue create -R someone/else`: refused with the guard's reason,
 *       and the fake gh never ran;
 *     B `gh issue create -R probe-owner/probe-repo`: runs;
 *     C `gh api repos/x/y/issues -f title=t`: refused, fake gh never ran;
 *     D `gh api repos/x/y/issues` (a GET): runs;
 *     T no GitHub token variable is in a command's environment;
 *     G a `gh api graphql` mutation naming no repository: refused, fake gh
 *       never ran;
 *     H a mutation naming the project's own repository: runs;
 *     X the real gh by its absolute path, `api repos/x/y/issues -f title=t`:
 *       fails signed out, with no token to post with;
 *     P `git commit` and `git push` to the clone's origin: lands;
 *     and B's fake gh ran with the host's token, handed to it alone.
 * (c) PATCH the project `upstreamPosts: true` (its own answer over the
 *     fleet's): the workspace's rule turns unguarded within a beat, and
 *     E, A again, runs; U its commands carry the caller's token again.
 *
 *   bun scripts/probe-kit/run.ts upstream-guard
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const TAG = "PROBE-UPSTREAM";
const OWN = "probe-owner/probe-repo";
/** The guard's refusal, as the session reads it (upstream-guard.ts `upstreamRefusal`). */
const REFUSED = (what: string, repo: string) =>
  `cawco: \`${what}\` did not run: it writes to ${repo}, and this project's repository is github.com/${OWN}.`;
const DRAFT = "Put what you would have posted";

/** Each step's command, in order; each ends by echoing its marker and the exit. */
/** The real gh on this host, found before the fake goes first on PATH: what step X runs by its path. */
const REAL_GH = Bun.which("gh") ?? "/usr/bin/gh";
const TOKEN_VARS = (id: string) =>
  `echo "TOKENVARS-${id}=$(env | grep -cE '^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)=')"`;
const TOKEN_COUNT = (id: string) => new RegExp(`TOKENVARS-${id}=(\\d+)`);
const MUTATION_NO_REPO = `gh api graphql -f 'query=mutation { addComment(input: {subjectId: "X", body: "hi"}) { clientMutationId } }'`;
const MUTATION_OWN = `gh api graphql -F owner=probe-owner -F name=probe-repo -f 'query=mutation($owner: String!, $name: String!) { r: repository(owner: $owner, name: $name) { id } }'`;

const STEPS = [
  { id: "A", command: "gh issue create -R someone/else --title t --body b" },
  { id: "B", command: `gh issue create -R ${OWN} --title t --body b` },
  { id: "C", command: "gh api repos/x/y/issues -f title=t" },
  { id: "D", command: "gh api repos/x/y/issues" },
  { id: "T", command: TOKEN_VARS("T") },
  { id: "G", command: MUTATION_NO_REPO },
  { id: "H", command: MUTATION_OWN },
  { id: "X", command: `${REAL_GH} api repos/x/y/issues -f title=t 2>&1` },
  {
    id: "P",
    command:
      "set -o pipefail; git -c user.name=Delegate -c user.email=d@probe.test commit -q --allow-empty -m 'Probe push' && git push origin HEAD:refs/heads/probe-push 2>&1 | sed 's/^/PUSH-OUT /'",
  },
  // Waits inside the boundary until the project's override reaches the rule.
  {
    id: "W",
    command: `until grep -q '"guarded":false' "$HOME/.cawco/workspaces/$CAWCO_WORKSPACE/ro/upstream.json"; do sleep 1; done`,
  },
  { id: "E", command: "gh issue create -R someone/else --title t --body b" },
  { id: "U", command: TOKEN_VARS("U") },
] as const;
type StepId = (typeof STEPS)[number]["id"];
const marker = (id: StepId) => `STEP-${id}-END`;
const EXIT = /STEP-([A-Z])-END exit=(\d+)/g;
/** What step P's push said, each line marked, and the line that says it landed. */
const PUSH_LINES = /^PUSH-OUT .*$/gm;
const PUSHED = /^PUSH-OUT .*\[new branch\]\s+HEAD -> probe-push$/m;

/** Whether the probe let the delegate past D: the override is applied. */
let overridden = false;
/** What each step's output read, once its marker came back. */
const outputs: Partial<Record<StepId, string>> = {};

const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return { everyMs: 5, words: ["ok"] };
  }
  for (const step of STEPS) {
    if (request.all.includes(marker(step.id))) {
      outputs[step.id] ??= request.all;
      continue;
    }
    // Until the probe has applied the override, a short wait keeps the turn going.
    const command =
      step.id === "W" && !overridden ? "sleep 3; echo WAITING" : step.command;
    if (step.id === "W" && !overridden) {
      return {
        everyMs: 5,
        words: [],
        tool: { name: "Bash", input: { command, description: "Wait" } },
      };
    }
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `${step.command}; echo "${marker(step.id)} exit=$?"`,
          description: `Step ${step.id}`,
        },
      },
    };
  }
  return { everyMs: 5, words: ["done"] };
};

/** The exit each step's marker reported, from the transcript as the mock last read it. */
const exitOf = (id: StepId): number | undefined => {
  for (const match of (outputs.U ?? outputs.E ?? outputs[id] ?? "").matchAll(
    EXIT
  )) {
    if (match[1] === id) {
      return Number(match[2]);
    }
  }
};

const FAKE_GH = `#!/bin/sh
# The probe's stand-in for gh: the host's token, or the call recorded with the
# token it ran with where the probe reads it.
if [ "$1 $2" = "auth token" ]; then echo probe-host-token; exit 0; fi
printf '%s token=%s\\n' "$*" "\${GH_TOKEN:-none}" >> "$TMPDIR/fake-gh.log"
echo "FAKE-GH-RAN $*"
`;

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  // The fake gh, first on every service's PATH and so on every session's;
  // outside the scratch HOME, where a boundary reads.
  const fakeBin = join(fleet.sandbox, "fake-bin");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(join(fakeBin, "gh"), FAKE_GH);
  await chmod(join(fakeBin, "gh"), 0o755);
  fleet.env.PATH = `${fakeBin}:${fleet.env.PATH}`;
  fleet.env.GH_TOKEN = "probe-caller-token";
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, "code");
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{
    id: string;
    upstreamPosts: boolean | null;
  }>("/api/projects", {
    name: "Upstream guard",
    machineId: MACHINE,
    cwd: repo,
  });

  // (a)
  const asked = (await (
    await fetch(`${fleet.base}/api/fleet/choices`)
  ).json()) as { upstream?: boolean | null };
  const answered = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upstream: false }),
  });
  const after = (await answered.json()) as { upstream?: boolean | null };
  check(
    "a: unanswered, the fleet's choice is null and a new project inherits; PUT keeps agents off",
    asked.upstream === null &&
      project.upstreamPosts === null &&
      answered.status === 200 &&
      after.upstream === false,
    `GET ${JSON.stringify(asked.upstream)}, project ${JSON.stringify(project.upstreamPosts)}, PUT ${answered.status} ${JSON.stringify(after.upstream)}`
  );
  // The remote a GitHub checkout's origin would give it (projects.remote).
  fleet.write(
    "UPDATE projects SET remote = ? WHERE id = ?",
    `github.com/${OWN}`,
    project.id
  );
  // The answer reaches the machine with its next beat (every 20 s), and the
  // workspace's first arming writes it.
  await Bun.sleep(25_000);

  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const item = await fleet.api<{ workItemId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Try upstream writes",
      prompt: `${TAG}: run the steps.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
      checks: [{ name: "Probe check", command: "true" }],
    }
  );
  const ruleFile = join(
    home,
    ".cawco",
    "workspaces",
    item.workspaceId,
    "ro",
    "upstream.json"
  );
  const fakeLog = join(
    home,
    ".cawco",
    "tmp",
    item.workspaceId.slice(0, 8),
    "fake-gh.log"
  );
  const logged = async (): Promise<string> =>
    await readFile(fakeLog, "utf8").catch(() => "");

  // (b)
  await until(
    "steps A to P ran",
    () => outputs.P,
    (said) => said !== undefined,
    600_000
  );
  const rule = await readFile(ruleFile, "utf8").catch(() => "");
  check(
    "b: the workspace's rule is guarded, the project inheriting the fleet's answer",
    rule.includes('"guarded":true') && rule.includes(`github.com/${OWN}`),
    rule
  );
  const calls = await logged();
  const text = outputs.P ?? "";
  const lines = calls.split("\n");
  check(
    "b: A `gh issue create -R someone/else` is refused with the reason, and the fake gh never ran",
    text.includes(REFUSED("gh issue create", "github.com/someone/else")) &&
      text.includes(DRAFT) &&
      exitOf("A") === 1 &&
      !calls.includes("-R someone/else"),
    `exit ${exitOf("A")}; fake gh calls:\n${calls}`
  );
  check(
    "b: B `gh issue create` against the project's own remote runs, with the host's token handed to it alone",
    exitOf("B") === 0 &&
      lines.some(
        (line) =>
          line.startsWith(`issue create -R ${OWN}`) &&
          line.endsWith("token=probe-host-token")
      ),
    `exit ${exitOf("B")}; fake gh calls:\n${calls}`
  );
  check(
    "b: C `gh api repos/x/y/issues -f title=t` is refused, and the fake gh never ran",
    text.includes(REFUSED("gh api POST repos/x/y/issues", "github.com/x/y")) &&
      exitOf("C") === 1 &&
      !calls.includes("-f title=t"),
    `exit ${exitOf("C")}; fake gh calls:\n${calls}`
  );
  check(
    "b: D `gh api repos/x/y/issues` (a GET) runs",
    exitOf("D") === 0 &&
      lines.some((line) => line.startsWith("api repos/x/y/issues token=")),
    `exit ${exitOf("D")}; fake gh calls:\n${calls}`
  );
  const guardedCount = TOKEN_COUNT("T").exec(text)?.[1];
  check(
    "b: T with the guard on, no GitHub token variable is in a command's environment (the caller's GH_TOKEN included)",
    guardedCount === "0",
    `TOKENVARS-T=${guardedCount}`
  );
  check(
    "b: G a `gh api graphql` mutation naming no repository is refused, and the fake gh never ran",
    text.includes(
      "cawco: `gh api graphql mutation` did not run: it names no repository the guard can check"
    ) &&
      exitOf("G") === 1 &&
      !calls.includes("addComment"),
    `exit ${exitOf("G")}; fake gh calls:\n${calls}`
  );
  check(
    "b: H a mutation naming the project's own repository runs",
    exitOf("H") === 0 && calls.includes("owner=probe-owner"),
    `exit ${exitOf("H")}; fake gh calls:\n${calls}`
  );
  check(
    `b: X ${REAL_GH} by its path, api repos/x/y/issues -f title=t, fails signed out`,
    exitOf("X") !== 0 &&
      exitOf("X") !== undefined &&
      text.includes("gh auth login"),
    `exit ${exitOf("X")}`
  );
  check(
    "b: P git push to the clone's origin (the hub, through the git door) lands",
    exitOf("P") === 0 && PUSHED.test(text),
    `exit ${exitOf("P")}; git said:\n${(text.match(PUSH_LINES) ?? []).join("\n")}`
  );

  // (c)
  const flipped = await fetch(`${fleet.base}/api/projects/${project.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upstreamPosts: true }),
  });
  const own = (await flipped.json()) as { upstreamPosts?: boolean | null };
  overridden = true;
  check(
    "c: PATCH sets the project's own answer over the fleet's",
    flipped.status === 200 && own.upstreamPosts === true,
    `${flipped.status} ${JSON.stringify(own.upstreamPosts)}`
  );
  await until(
    "step U ran",
    () => outputs.U,
    (said) => said !== undefined,
    300_000
  );
  const finalCalls = await logged();
  check(
    "c: with the project's override, E `gh issue create -R someone/else` runs",
    exitOf("E") === 0 && finalCalls.includes("issue create -R someone/else"),
    `exit ${exitOf("E")}; fake gh calls:\n${finalCalls}`
  );
  const openCount = TOKEN_COUNT("U").exec(outputs.U ?? "")?.[1];
  check(
    "c: U unguarded, commands carry the caller's GH_TOKEN as before",
    openCount === "1",
    `TOKENVARS-U=${openCount}`
  );
};

export default { name: "upstream-guard", run } satisfies Spec;
