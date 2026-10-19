/**
 * The upstream guard (core upstream-guard.ts, agent github-door.ts and
 * hub-git.ts, hub upstream.ts), its choice made where the owner put it:
 * Caw's Needs you while the fleet's is unanswered (the onboarding row,
 * NeedsCard), and each project's ⋯ menu (UpstreamMenu). While the choice
 * keeps agents off other people's repositories, a write to one does not go
 * out, and the session reads why. It is held where the credential is: a
 * guarded workspace holds no forge's token, and what it writes with a
 * credential goes through its GitHub door or its git door, on the host. On
 * a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: run it where a workspace boundary can
 * start (not inside another one).
 *
 * A fake `gh` first on the services' PATH records each call it runs, with
 * the GitHub token it ran with and whether its config sends it through the
 * workspace's GitHub door, in the workspace's TMPDIR. On the host it is the
 * agent's gh too, whose `gh auth token` answers `probe-host-token` for
 * github.com and, as the real gh does, nothing for any other host. The
 * host's gh config names a unix socket (`http_unix_socket`, as go-gh reads
 * it) where a stand-in of GitHub's API answers `/user` as `probe-person`:
 * the GitHub adapter reads the login there (agent forges/github.ts). The
 * host's real gh, by its path, is what posts through the door. The services run with a caller's token for every forge
 * (`GH_TOKEN` `probe-caller-token`, `GITLAB_TOKEN`, `OAUTH_TOKEN`,
 * `CI_JOB_TOKEN`, `GITEA_TOKEN`), as a person's shell may. The project is a
 * checkout with no origin of its own, so the hub is its remote and a
 * workspace's push goes through the workspace's git door, as it does for
 * every project whose remote is the hub. (A clone keeps its source's own
 * origin, clone.ts, and a local path outside the clone is no origin a
 * boundary can write, guarded or not.) Its remote is recorded as
 * github.com/probe-owner/probe-repo, as a GitHub checkout's would be.
 * "Another person's repository" on a host that is not GitHub is a bare
 * repository the probe serves over http with git's own http-backend, on
 * the host's loopback, counting each push it takes.
 *
 * Every choice is pressed in the built dashboard, at the desk (1440, a
 * mouse) and on the phone (390, a finger: a tap at the control's centre),
 * and read from the engine (boxes, the hit test, aria-checked) and the hub.
 *
 * (a) A new fleet has no answer and a new project inherits: GET
 *     /api/fleet/choices says `upstream: null`, the project
 *     `upstreamPosts: null`. Needs you holds one row for it, at the desk and
 *     on the phone: "Other people's repositories", its risk, "Onboarding ·
 *     each project can change it", and its two options as peers (one
 *     height, one fill) inside the row, each the hit test's at its centre;
 *     the list never scrolls sideways. A tap on the phone's "Keep agents off
 *     other repositories": the hub's fleet answer is false, and the row
 *     leaves both pages, the desk's by the hub's `fleet.upstream` frame.
 * (m) The project's ⋯ › Other people's repositories, at the desk and on the
 *     phone: its submenu lies inside the viewport and holds three radio
 *     items in UPSTREAM_WORDS' words, "Same as the fleet · Keep agents off
 *     other repositories" the one checked, each the hit test's at its centre.
 * (b) One delegate of the project, its workspace's rule guarded by the
 *     fleet's answer the onboarding row gave (the project inherits), runs:
 *     T no forge's token variable is in a command's environment;
 *     B `gh issue create -R probe-owner/probe-repo` (the fake): runs with no
 *       token at all, its config naming the GitHub door;
 *     G the real gh's `api graphql` mutation naming no repository: refused
 *       by the GitHub door;
 *     X the real gh, `api repos/x/y/issues -f title=t`: refused by the door;
 *     Z the real curl straight to the door's socket, the same POST: refused;
 *     S `git push git@other.probe.test:…` (ssh): refused at the git door in
 *       the guard's words, with the draft line;
 *     L the same under another login, `alice@other.probe.test:…`: git's ssh
 *       inside says the workspace holds no key, and nothing goes;
 *     P `git commit` and `git push` to the clone's origin: lands.
 * (c) ⋯ › "Let agents post upstream" at the desk: the hub has the project's
 *     own `true` over the fleet's; its rule turns unguarded within a beat,
 *     and E, the real gh's POST to repos/someone/else/issues, is not stopped
 *     by CawCo; U its commands still carry no forge token: the GitHub door
 *     posts for them with the host's.
 * (d) ⋯ › "Same as the fleet" on the phone: the project's own answer goes
 *     (null) and it follows the fleet's, keep off: its rule turns guarded
 *     within a beat, and F, E again, is refused by the door.
 * (e) The fleet's answer turned to "Let agents post upstream" (PUT, as a
 *     setup page's card sends it): the project, still the fleet's, turns
 *     unguarded within a beat and I, E again, is not stopped; the desk's ⋯
 *     names the fleet's new answer beside "Same as the fleet".
 * (f) ⋯ › "Keep agents off other repositories" at the desk: the project's
 *     own `off` over the fleet's `on`; its rule turns guarded within a
 *     beat, and K, E again, is refused.
 * (g) ⋯ › "Ask me first" at the desk: the project's own `ask`; its rule
 *     reads `ask` within a beat. Then (hub upstream-asks.ts):
 *     S1 the real gh's `api repos/someone/else/issues` with title 'Probe
 *       deny' and a body: held at the GitHub door, sent nowhere; the
 *       session reads that it waits in the owner's Needs you;
 *     S2 the same again: the session reads it is already waiting, and no
 *       second ask parks for it;
 *     S3 a commit pushed to the http-backend's someone/else.git, on a host
 *       that is not GitHub: held at the git door, sent nowhere;
 *     S4 the real gh's comment on someone/else's issue 12, two lines long:
 *       held at the GitHub door.
 *     Each held post's row in the desk's Needs you names it: its own title
 *     ('Probe deny'; the comment's first line, 'Probe comment') over where
 *     it goes (someone/else, someone/else#12), the session that asked on
 *     its last line.
 *     Each parks as the delegate's permission ask (`UPSTREAM_POST_TOOL`),
 *     its card naming the repository, the kind, the title, the account it
 *     posts as on its host, and the post. Deny on S1's row in the desk's
 *     Needs you: the ask goes, and the session is told it was denied.
 *     Approve on S3's row on the phone: the host pushes exactly that commit
 *     there once, and the session is told what it said.
 *
 *   bun scripts/probe-kit/run.ts upstream-guard
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one hand, one step at a time.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the scenario runs in order, one choice after the last.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import {
  UPSTREAM_WORDS,
  type UpstreamPosts,
} from "../../../packages/core/src/upstream-guard";
import { UPSTREAM_POST_TOOL } from "../../../packages/core/src/upstream-post";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { serveGitHttp } from "../git-http";
import { type Kit, open, type Spec, settle } from "../kit";

const TAG = "PROBE-UPSTREAM";
const OWN = "probe-owner/probe-repo";
const NAME = "Upstream guard";

/** The real gh on this host, found before the fake goes first on PATH: what posts through the GitHub door. */
const REAL_GH = Bun.which("gh") ?? "/usr/bin/gh";
/** The real curl, by its path: what step Z sends by hand. */
const REAL_CURL = Bun.which("curl") ?? "/usr/bin/curl";
/** The GitHub door's refusal of `what` writing to `repo` (github-door.ts `judged`, upstream-guard.ts `writeRefusal`). */
const DOOR_REFUSED = (what: string, repo: string) =>
  `cawco: \`${what}\` did not run: it writes to ${repo}`;
const XY_REFUSED = DOOR_REFUSED(
  "POST api.github.com/repos/x/y/issues",
  "github.com/x/y"
);
const ELSEWHERE_REFUSED = DOOR_REFUSED(
  "POST api.github.com/repos/someone/else/issues",
  "github.com/someone/else"
);
/** The door's refusal of a mutation that names no repository. */
const NO_REPO_REFUSED =
  "cawco: `a GraphQL mutation` did not run: it names no repository the guard can check";
/** Git's ssh inside a workspace (hub-git.ts `SSH_REFUSAL`). */
const SSH_REFUSED = "cawco: git over ssh did not run here";
const DRAFT = "Put what you would have posted";
/** Every forge's token variable the services carry. */
const FORGE_TOKENS =
  "GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GITLAB_TOKEN|OAUTH_TOKEN|CI_JOB_TOKEN|GITEA_TOKEN";
const TOKEN_VARS = (id: string) =>
  `echo "TOKENVARS-${id}=$(env | grep -cE '^(${FORGE_TOKENS})=')"`;
const TOKEN_COUNT = (id: string) => new RegExp(`TOKENVARS-${id}=(\\d+)`);
const MUTATION_NO_REPO = `${REAL_GH} api graphql -f 'query=mutation { addComment(input: {subjectId: "X", body: "hi"}) { clientMutationId } }' 2>&1`;
/** A post to someone else's repository on GitHub, by the real gh through whatever its config names. */
const ELSEWHERE = `${REAL_GH} api repos/someone/else/issues -f title=t 2>&1`;
/** Waits inside the boundary until the workspace's rule reads `posts`. */
const RULE_READS = (posts: UpstreamPosts) =>
  `until grep -q '"posts":"${posts}"' "$HOME/.cawco/workspaces/$CAWCO_WORKSPACE/ro/upstream.json"; do sleep 1; done`;
/** Step S1's post under Ask, asked twice: held at the GitHub door. */
const DENIED = `${REAL_GH} api repos/someone/else/issues -f title='Probe deny' -f body='Denied body' 2>&1`;
/** Step S4's comment on someone/else's issue 12, two lines long: held at the GitHub door. */
const COMMENTED = `${REAL_GH} api repos/someone/else/issues/12/comments -f body="$(printf 'Probe comment\\nIts second line')" 2>&1`;
/** The branch step S3 pushes to the http-backend's repository. */
const APPROVED_BRANCH = "probe-approve";
/** What the session reads as its post is held (upstream-guard.ts `heldWords`). */
const HELD = "was not posted yet: it waits in the owner's Needs you";
const AGAIN = "is already waiting for the owner's answer";
/** The host's gh login, as the fake answers `gh api user`. */
const PERSON = "probe-person";
/** The http-backend's someone/else.git, once it serves: the other host's repository. */
let otherUrl = "";

/** Each step's command, in order; each ends by echoing its marker and the exit. */
const STEPS = [
  { id: "T", command: TOKEN_VARS("T") },
  { id: "B", command: `gh issue create -R ${OWN} --title t --body b` },
  { id: "G", command: MUTATION_NO_REPO },
  { id: "X", command: `${REAL_GH} api repos/x/y/issues -f title=t 2>&1` },
  {
    id: "Z",
    command: `sock=$(sed -n 's/^http_unix_socket: "\\(.*\\)"$/\\1/p' "$GH_CONFIG_DIR/config.yml"); ${REAL_CURL} -s --unix-socket "$sock" -X POST http://api.github.com/repos/x/y/issues -d '{"title":"t"}'`,
  },
  {
    id: "S",
    command:
      "git push git@other.probe.test:someone/else.git HEAD:refs/heads/probe-ssh 2>&1",
  },
  {
    id: "L",
    command:
      "git push alice@other.probe.test:someone/else.git HEAD:refs/heads/probe-alice 2>&1",
  },
  {
    id: "P",
    command:
      "set -o pipefail; git -c user.name=Delegate -c user.email=d@probe.test commit -q --allow-empty -m 'Probe push' && git push origin HEAD:refs/heads/probe-push 2>&1 | sed 's/^/PUSH-OUT /'",
  },
  // Each wait holds until the probe has pressed the next choice, then until
  // that choice has reached the workspace's rule.
  { id: "W", command: RULE_READS("on") },
  { id: "E", command: ELSEWHERE },
  { id: "U", command: TOKEN_VARS("U") },
  { id: "V", command: RULE_READS("off") },
  { id: "F", command: ELSEWHERE },
  { id: "Y", command: RULE_READS("on") },
  { id: "I", command: ELSEWHERE },
  { id: "Q", command: RULE_READS("off") },
  { id: "K", command: ELSEWHERE },
  { id: "R", command: RULE_READS("ask") },
  { id: "1", command: DENIED },
  { id: "2", command: DENIED },
  {
    id: "3",
    command: () =>
      `git -c user.name=Delegate -c user.email=d@probe.test commit -q --allow-empty -m 'Probe approve' && git push ${otherUrl} HEAD:refs/heads/${APPROVED_BRANCH} 2>&1`,
  },
  { id: "4", command: COMMENTED },
] as const;
type StepId = (typeof STEPS)[number]["id"];
/** The waits, each let go once the probe has pressed the choice it waits on. */
const WAITS: readonly StepId[] = ["W", "V", "Y", "Q", "R"];
const released = new Set<StepId>();
const marker = (id: StepId) => `STEP-${id}-END`;
const EXIT = /STEP-([A-Z0-9])-END exit=(\d+)/g;
/** The transcript as the model last read it, whatever it was answering: the hub's word on an answered post lands after the last step. */
let seen = "";
/** Where step `id`'s marker came back, its exit with it. */
const endOf = (text: string, id: StepId) =>
  text.search(new RegExp(`STEP-${id}-END exit=\\d`));
/** What each step's output read, once its marker came back. */
const outputs: Partial<Record<StepId, string>> = {};
/** What step P's push said, each line marked, and the line that says it landed. */
const PUSH_LINES = /^PUSH-OUT .*$/gm;
const PUSHED = /^PUSH-OUT .*\[new branch\]\s+HEAD -> probe-push$/m;

const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return { everyMs: 5, words: ["ok"] };
  }
  seen = request.all;
  for (const step of STEPS) {
    if (request.all.includes(marker(step.id))) {
      outputs[step.id] ??= request.all;
      continue;
    }
    // Until the probe has pressed the choice it waits on, a short wait
    // keeps the turn going.
    const held = WAITS.includes(step.id) && !released.has(step.id);
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: held
          ? { command: "sleep 3; echo WAITING", description: "Wait" }
          : {
              command: `${typeof step.command === "function" ? step.command() : step.command}; echo "${marker(step.id)} exit=$?"`,
              description: `Step ${step.id}`,
            },
      },
    };
  }
  return { everyMs: 5, words: ["done"] };
};

/** The transcript as the mock last read it: the latest step's. */
const latest = (): string => {
  for (const step of [...STEPS].reverse()) {
    const said = outputs[step.id];
    if (said) {
      return said;
    }
  }
  return "";
};

/** The exit each step's marker reported. */
const exitOf = (id: StepId): number | undefined => {
  for (const match of latest().matchAll(EXIT)) {
    if (match[1] === id) {
      return Number(match[2]);
    }
  }
};

/** What step `id` printed: from the step before's marker to its own. */
const said = (from: StepId, id: StepId): string => {
  const text = latest();
  const start = endOf(text, from);
  const end = endOf(text, id);
  return start >= 0 && end > start ? text.slice(start, end) : "";
};

const FAKE_GH = `#!/bin/sh
# The probe's stand-in for gh: the host's token for github.com (none for any
# other --hostname, as the real gh answers), or the call recorded with the
# token it ran with in the workspace's TMPDIR, where the probe reads it. On
# the host it answers nothing else.
if [ "$1 $2" = "auth token" ]; then
  if [ "$3" = --hostname ] && [ "$4" != github.com ]; then echo "no oauth token found for $4" >&2; exit 1; fi
  echo probe-host-token; exit 0
fi
if [ -z "$CAWCO_WORKSPACE" ]; then exit 1; fi
case "$(cat "$GH_CONFIG_DIR/config.yml" 2>/dev/null)" in *http_unix_socket*) door=yes ;; *) door=no ;; esac
printf '%s token=%s door=%s\\n' "$*" "\${GH_TOKEN:-none}" "$door" >> "$TMPDIR/fake-gh.log"
echo "FAKE-GH-RAN $*"
`;

/** A forced ref's mark before its commit, on a held push's card. */
const FORCED = /^\+/;
/** The other host's repository, under the http-backend's root. */
const ELSE_REPO = "someone/else.git";

type View = "desk" | "phone";
const VIEWS: readonly View[] = ["desk", "phone"];

/** A press where a hand presses: the mouse at the desk, a finger's tap on the phone. */
const press = async (page: Page, view: View, selector: string) => {
  const at = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find(
      (one) => one.getBoundingClientRect().width > 0
    );
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, selector);
  if (!at) {
    throw new Error(`nothing drawn at ${selector}`);
  }
  await (view === "phone"
    ? page.touchscreen.tap(at.x, at.y)
    : page.mouse.click(at.x, at.y));
};

const NEEDS_ROW =
  ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"]) :is([data-slot="row"], [data-task-table-row], [data-project-spend-row], [data-view-routines-row], [data-view-table-row], [data-layout-row], [data-account-name-row], [data-session-row-row])[data-kind="choice"]';
/** A permission ask's row in Caw's Needs you: a held post's. */
const ASK_ROW = NEEDS_ROW.replace('[data-kind="choice"]', '[data-kind="ask"]');
const OPEN_MENU = "[data-slot='dropdown-menu-content'][data-state='open']";
const OPEN_SUB = "[data-slot='dropdown-menu-sub-content'][data-state='open']";
const SUB_TRIGGER = `${OPEN_MENU} [data-slot='dropdown-menu-sub-trigger'][data-probe-upstream]`;

/** Caw's panel opened from his head in the bar, as a hand opens it. */
const openNeeds = async (page: Page, view: View, base: string) => {
  await open(page, base, "[data-needs-caw]");
  await press(page, view, "[data-needs-caw]");
  await page.waitForSelector(
    ':is([data-caw-pop], [data-glass-card-frame~="caw-pop"])[data-shown]',
    { timeout: 30_000 }
  );
  await settle(page, 400);
};

/**
 * The choice row as the engine lays it out: its words (each node's shown
 * words, skipping what a kit Button keeps hidden beside them), its
 * buttons' boxes, fills and hit tests, and the list's sideways scroll.
 */
const readChoiceRow = (selector: string) => {
  const shown = (node: Element | null): string => {
    if (!node) {
      return "";
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let words = "";
    for (let run = walker.nextNode(); run; run = walker.nextNode()) {
      if (!run.parentElement?.closest('[aria-hidden="true"]')) {
        words += run.textContent ?? "";
      }
    }
    return words.replace(/\s+/g, " ").trim();
  };
  const row = document.querySelector(selector);
  if (!row) {
    return null;
  }
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const list =
    row.closest(':is([data-slot="list"], [data-list])') ??
    row.closest(':is([data-caw-pop], [data-glass-card-frame~="caw-pop"])');
  return {
    name: shown(
      row.querySelector(
        ':is([data-slot="name"], [data-transcript-skeleton-name])'
      )
    ),
    want: shown(row.querySelector('[data-slot="want"]')),
    meta: shown(row.querySelector(':is([data-slot="meta"], [data-meta])')),
    opens: row.querySelector('a[data-slot="cover"]') !== null,
    row: box(row),
    sideways: list ? list.scrollWidth - list.clientWidth : -1,
    buttons: [...row.querySelectorAll('[data-slot="peers"] button')].map(
      (button) => {
        const b = button.getBoundingClientRect();
        const hit = document.elementFromPoint(
          b.left + b.width / 2,
          b.top + b.height / 2
        );
        return {
          label: shown(button),
          box: box(button),
          height: b.height,
          width: b.width,
          fill: getComputedStyle(button).backgroundColor,
          hits: Boolean(hit && button.contains(hit)),
        };
      }
    ),
  };
};

/** The project's ⋯ opened and its upstream row pressed: the submenu, read. */
const openUpstream = async (page: Page, view: View) => {
  // The page is drawn on the server: a press before it hydrates is lost,
  // so one that opened nothing in 3 s is pressed again.
  await press(page, view, `[aria-label="More for ${NAME}"]`);
  const opened = await page
    .waitForSelector(OPEN_MENU, { timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await press(page, view, `[aria-label="More for ${NAME}"]`);
    await page.waitForSelector(OPEN_MENU, { timeout: 10_000 });
  }
  await settle(page, 200);
  // The sub-trigger holding the upstream row's title, marked to be pressed.
  await page.evaluate(
    ({ menu, title }) => {
      for (const trigger of document.querySelectorAll(
        `${menu} [data-slot='dropdown-menu-sub-trigger']`
      )) {
        if (trigger.textContent?.includes(title)) {
          trigger.setAttribute("data-probe-upstream", "");
        }
      }
    },
    { menu: OPEN_MENU, title: UPSTREAM_WORDS.title }
  );
  await press(page, view, SUB_TRIGGER);
  await page.waitForSelector(OPEN_SUB, { timeout: 5000 });
  await settle(page, 300);
  return page.evaluate((sel) => {
    const sub = document.querySelector(sel) as HTMLElement;
    const r = sub.getBoundingClientRect();
    return {
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      vw: document.documentElement.clientWidth,
      vh: document.documentElement.clientHeight,
      items: [...sub.querySelectorAll("[role='menuitemradio']")].map((item) => {
        const b = item.getBoundingClientRect();
        const hit = document.elementFromPoint(
          b.left + b.width / 2,
          b.top + b.height / 2
        );
        return {
          // Its lines as drawn, one " · " between: "Same as the fleet"
          // over the fleet's answer reads "Same as the fleet · …".
          name: (item as HTMLElement).innerText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" · "),
          lines: (item as HTMLElement).innerText
            .split("\n")
            .filter((line) => line.trim()).length,
          checked: item.getAttribute("aria-checked") === "true",
          hits: Boolean(hit && item.contains(hit)),
          // Its words whole: none cut by the submenu's width.
          whole: item.scrollWidth <= item.clientWidth + 1,
        };
      }),
    };
  }, OPEN_SUB);
};

/** Every menu put away. */
const dismiss = async (page: Page) => {
  for (let n = 0; n < 3; n += 1) {
    if ((await page.locator(OPEN_MENU).count()) === 0) {
      break;
    }
    await page.keyboard.press("Escape");
    await page
      .waitForSelector(OPEN_MENU, { state: "detached", timeout: 2000 })
      .catch(() => undefined);
  }
  await settle(page, 200);
};

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
  // GitHub's API for the host's gh sign-in: `/user` names the person, over
  // the socket the host's gh config names.
  const githubSocket = join(
    process.env.TMPDIR ?? "/tmp",
    `ug-${crypto.randomUUID().slice(0, 8)}.sock`
  );
  const githubApi = Bun.serve({
    unix: githubSocket,
    fetch: (request) =>
      new URL(request.url).pathname === "/user"
        ? Response.json({ login: PERSON })
        : Response.json({ message: "Not Found" }, { status: 404 }),
  });
  const hostGhConfig = join(fleet.sandbox, "host-gh");
  await mkdir(hostGhConfig, { recursive: true });
  await writeFile(
    join(hostGhConfig, "config.yml"),
    `version: "1"\nhttp_unix_socket: ${JSON.stringify(githubSocket)}\n`
  );
  fleet.env.GH_CONFIG_DIR = hostGhConfig;
  Object.assign(fleet.env, {
    GH_TOKEN: "probe-caller-token",
    GITLAB_TOKEN: "probe-gitlab-token",
    OAUTH_TOKEN: "probe-oauth-token",
    CI_JOB_TOKEN: "probe-ci-token",
    GITEA_TOKEN: "probe-gitea-token",
  });
  // Another person's repository, on a host that is not GitHub.
  const elsewhere = serveGitHttp(join(fleet.sandbox, "other"));
  otherUrl = await elsewhere.bare(ELSE_REPO);
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
    name: NAME,
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  /** The project's own answer at the hub: null while it takes the fleet's. */
  const projectPosts = (): UpstreamPosts | null => {
    const [row] = fleet.query<{ upstream_posts: UpstreamPosts | null }>(
      "SELECT upstream_posts FROM projects WHERE id = ?",
      project.id
    );
    return row?.upstream_posts ?? null;
  };
  const fleetAnswer = async () =>
    (
      (await (await fetch(`${fleet.base}/api/fleet/choices`)).json()) as {
        upstream?: UpstreamPosts | null;
      }
    ).upstream;

  // (a)
  const asked = await fleetAnswer();
  check(
    "a: unanswered, the fleet's choice is null and a new project inherits",
    asked === null && project.upstreamPosts === null,
    `GET ${JSON.stringify(asked)}, project ${JSON.stringify(project.upstreamPosts)}`
  );
  const base = await fleet.dashboard();
  const pages = {} as Record<View, Page>;
  for (const view of VIEWS) {
    const page = await kit.page(view);
    page.setDefaultTimeout(60_000);
    pages[view] = page;
    await openNeeds(page, view, base);
    await page.waitForSelector(NEEDS_ROW, { timeout: 30_000 });
    await settle(page, 300);
    const read = await page.evaluate(readChoiceRow, NEEDS_ROW);
    await page
      .locator(NEEDS_ROW)
      .screenshot({ path: join(kit.out, `needs-row-${view}.png`) });
    const [keep, ask, allow] = read?.buttons ?? [];
    check(
      `a, ${view}: Needs you asks it in one row: its title, its risk, onboarding's line, and opens nothing`,
      read?.name === UPSTREAM_WORDS.title &&
        read.want === UPSTREAM_WORDS.risk &&
        read.meta === "Onboarding · each project can change it" &&
        !read.opens,
      JSON.stringify(read && { ...read, buttons: undefined })
    );
    check(
      `a, ${view}: its three options are peers (one width, one height, one fill), keep off first, then ask me first, inside the row, each the hit test's at its centre; nothing scrolls sideways`,
      Boolean(
        read &&
        keep &&
        ask &&
        allow &&
        read.buttons.length === 3 &&
        keep.label === UPSTREAM_WORDS.keepOff &&
        ask.label === UPSTREAM_WORDS.ask &&
        allow.label === UPSTREAM_WORDS.allow &&
        [ask, allow].every(
          (other) =>
            Math.abs(keep.width - other.width) <= 0.5 &&
            Math.abs(keep.height - other.height) <= 0.5 &&
            keep.fill === other.fill
        ) &&
        read.buttons.every(
          (button) =>
            button.hits &&
            button.box.left >= read.row.left - 0.5 &&
            button.box.right <= read.row.right + 0.5
        ) &&
        read.sideways === 0
      ),
      JSON.stringify({
        row: read?.row,
        sideways: read?.sideways,
        buttons: read?.buttons,
      })
    );
  }
  await press(
    pages.phone,
    "phone",
    `${NEEDS_ROW} [data-slot="peers"] button:first-of-type`
  );
  const answered = await until(
    "a: the fleet's answer at the hub",
    fleetAnswer,
    (now) => now !== null,
    30_000
  ).catch(() => undefined);
  const gone = await Promise.all(
    VIEWS.map((view) =>
      pages[view]
        .waitForSelector(NEEDS_ROW, { state: "detached", timeout: 15_000 })
        .then(() => true)
        .catch(() => false)
    )
  );
  check(
    "a: the phone's “Keep agents off other repositories” answers the fleet's choice (off), and the row leaves the phone and the desk",
    answered === "off" && gone.every(Boolean),
    `GET ${JSON.stringify(answered)}; row gone: desk ${gone[0]}, phone ${gone[1]}`
  );
  // The remote a GitHub checkout's origin would give it (projects.remote).
  fleet.write(
    "UPDATE projects SET remote = ? WHERE id = ?",
    `github.com/${OWN}`,
    project.id
  );

  // (m)
  const projectUrl = `${base}/project/${project.id}`;
  for (const view of VIEWS) {
    const page = pages[view];
    await open(page, projectUrl, `[aria-label="More for ${NAME}"]`);
    await settle(page, 400);
    const menu = await openUpstream(page, view);
    await page
      .locator(OPEN_SUB)
      .screenshot({ path: join(kit.out, `upstream-menu-${view}.png`) });
    const b = menu.box;
    check(
      `m, ${view}: ⋯ › ${UPSTREAM_WORDS.title} opens a submenu inside the viewport`,
      b.left >= 0 && b.top >= 0 && b.right <= menu.vw && b.bottom <= menu.vh,
      `x ${b.left.toFixed(1)}…${b.right.toFixed(1)}, y ${b.top.toFixed(1)}…${b.bottom.toFixed(1)} in ${menu.vw}×${menu.vh}`
    );
    const fleetsKeepOff = `${UPSTREAM_WORDS.inherit} · ${UPSTREAM_WORDS.keepOff}`;
    check(
      `m, ${view}: four radio items in UPSTREAM_WORDS' words, “${fleetsKeepOff}” the one checked (the fleet's answer its own second line), each whole and the hit test's at its centre`,
      menu.items.map((item) => item.name).join(" | ") ===
        [
          fleetsKeepOff,
          UPSTREAM_WORDS.keepOff,
          UPSTREAM_WORDS.ask,
          UPSTREAM_WORDS.allow,
        ].join(" | ") &&
        menu.items.map((item) => item.lines).join() === "2,1,1,1" &&
        menu.items.filter((item) => item.checked).length === 1 &&
        menu.items[0]?.checked === true &&
        menu.items.every((item) => item.hits && item.whole),
      JSON.stringify(menu.items)
    );
    await dismiss(page);
  }
  /**
   * One of the ⋯ menu's three answers pressed, as `view`'s hand presses it:
   * the item whose first line is `words`.
   */
  const choose = async (view: View, words: string) => {
    const page = pages[view];
    await open(page, projectUrl, `[aria-label="More for ${NAME}"]`);
    await settle(page, 400);
    await openUpstream(page, view);
    await page.evaluate(
      ({ sub, want }) => {
        for (const item of document.querySelectorAll<HTMLElement>(
          `${sub} [role='menuitemradio']`
        )) {
          if (item.innerText.split("\n")[0]?.trim() === want) {
            item.setAttribute("data-probe-pick", "");
          }
        }
      },
      { sub: OPEN_SUB, want: words }
    );
    await press(page, view, `${OPEN_SUB} [data-probe-pick]`);
    await settle(page, 300);
  };

  // The answer reaches the machine with its next beat (every 20 s), and the
  // workspace's first arming writes it.
  await Bun.sleep(25_000);

  const parent = await fleet.spawn("claude", "Parent", repo, {
    projectId: project.id,
  });
  const work = await fleet.api<{ workItemId: string; workspaceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: "Try upstream writes",
      prompt: `${TAG}: run the steps.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: repo,
    }
  );
  const ruleFile = join(
    home,
    ".cawco",
    "workspaces",
    work.workspaceId,
    "ro",
    "upstream.json"
  );
  const fakeLog = join(
    home,
    ".cawco",
    "tmp",
    work.workspaceId.slice(0, 8),
    "fake-gh.log"
  );
  const logged = async (): Promise<string> =>
    await readFile(fakeLog, "utf8").catch(() => "");
  const stepRan = (id: StepId, within: number) =>
    until(
      `step ${id} ran`,
      () => outputs[id],
      (out) => out !== undefined,
      within
    );

  // (b)
  await stepRan("P", 600_000);
  const rule = await readFile(ruleFile, "utf8").catch(() => "");
  check(
    "b: the workspace's rule is guarded, the project inheriting the fleet's answer the onboarding row gave",
    rule.includes('"posts":"off"') &&
      rule.includes(`github.com/${OWN}`) &&
      projectPosts() === null,
    rule
  );
  const calls = await logged();
  const text = latest();
  const guardedCount = TOKEN_COUNT("T").exec(text)?.[1];
  check(
    "b: T with the guard on, no forge's token variable is in a command's environment (the caller's GH_TOKEN, GITLAB_TOKEN, OAUTH_TOKEN, CI_JOB_TOKEN and GITEA_TOKEN included)",
    guardedCount === "0",
    `TOKENVARS-T=${guardedCount}`
  );
  check(
    "b: B `gh issue create` runs with no token at all, its config naming the GitHub door",
    exitOf("B") === 0 &&
      calls
        .split("\n")
        .some(
          (line) =>
            line.startsWith(`issue create -R ${OWN}`) &&
            line.endsWith("token=none door=yes")
        ),
    `exit ${exitOf("B")}; fake gh calls:\n${calls}`
  );
  check(
    `b: G ${REAL_GH}'s \`api graphql\` mutation naming no repository is refused by the GitHub door, with the draft line`,
    exitOf("G") !== 0 &&
      said("B", "G").includes(NO_REPO_REFUSED) &&
      said("B", "G").includes(DRAFT),
    `exit ${exitOf("G")}; said:\n${said("B", "G")}`
  );
  check(
    `b: X ${REAL_GH} by its path, api repos/x/y/issues -f title=t, is refused by the GitHub door`,
    exitOf("X") !== 0 && said("G", "X").includes(XY_REFUSED),
    `exit ${exitOf("X")}; said:\n${said("G", "X")}`
  );
  check(
    `b: Z ${REAL_CURL} straight to the door's socket, POST repos/x/y/issues, is refused`,
    said("X", "Z").includes(XY_REFUSED),
    `exit ${exitOf("Z")}; said:\n${said("X", "Z")}`
  );
  check(
    "b: S a push over ssh to another host's repository is refused at the git door in the guard's words",
    exitOf("S") !== 0 &&
      said("Z", "S").includes(
        "cawco: `git push git@other.probe.test:someone/else.git` did not run: it writes to other.probe.test/someone/else"
      ) &&
      said("Z", "S").includes(DRAFT),
    `exit ${exitOf("S")}; said:\n${said("Z", "S")}`
  );
  check(
    "b: L a push over ssh under another login: git's ssh says the workspace holds no key, and the push fails",
    exitOf("L") !== 0 && said("S", "L").includes(SSH_REFUSED),
    `exit ${exitOf("L")}; said:\n${said("S", "L")}`
  );
  check(
    "b: P git push to the clone's origin (the hub, through the git door) lands",
    exitOf("P") === 0 && PUSHED.test(text),
    `exit ${exitOf("P")}; git said:\n${(text.match(PUSH_LINES) ?? []).join("\n")}`
  );

  /** Whether CawCo let step `id`'s post go: nothing of the guard's in what it said. */
  const letGo = (from: StepId, id: StepId) =>
    !said(from, id).includes("cawco:");

  // (c)
  await choose("desk", UPSTREAM_WORDS.allow);
  released.add("W");
  check(
    "c: the desk's ⋯ › “Let agents post upstream” sets the project's own answer over the fleet's",
    (await until(
      "c: the project's own answer",
      projectPosts,
      (now) => now === "on",
      15_000
    ).catch(projectPosts)) === "on",
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("U", 300_000);
  check(
    "c: with the project's own answer, E the real gh's POST to repos/someone/else/issues is not stopped by CawCo",
    exitOf("E") !== undefined && letGo("W", "E"),
    `exit ${exitOf("E")}; said:\n${said("W", "E")}`
  );
  const openCount = TOKEN_COUNT("U").exec(latest())?.[1];
  check(
    "c: U where agents may post, commands still carry none of the caller's five forge tokens: the GitHub door posts for them",
    openCount === "0",
    `TOKENVARS-U=${openCount}`
  );

  // (d)
  await choose("phone", UPSTREAM_WORDS.inherit);
  released.add("V");
  check(
    "d: the phone's ⋯ › “Same as the fleet” clears the project's own answer",
    (await until(
      "d: the project inherits",
      projectPosts,
      (now) => now === null,
      15_000
    ).catch(projectPosts)) === null,
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("F", 300_000);
  check(
    "d: following the fleet's keep off, F, E again, is refused by the GitHub door",
    exitOf("F") !== 0 && said("V", "F").includes(ELSEWHERE_REFUSED),
    `exit ${exitOf("F")}; said:\n${said("V", "F")}`
  );

  // (e)
  const turned = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upstream: "on" }),
  });
  released.add("Y");
  await stepRan("I", 300_000);
  check(
    "e: the fleet's answer turned to “Let agents post upstream”, the project, still the fleet's, follows: I, E again, is not stopped by CawCo",
    turned.status === 200 && projectPosts() === null && letGo("Y", "I"),
    `PUT ${turned.status}; exit ${exitOf("I")}; said:\n${said("Y", "I")}`
  );
  await open(pages.desk, projectUrl, `[aria-label="More for ${NAME}"]`);
  await settle(pages.desk, 400);
  const named = await openUpstream(pages.desk, "desk");
  await dismiss(pages.desk);
  const fleetsAllow = `${UPSTREAM_WORDS.inherit} · ${UPSTREAM_WORDS.allow}`;
  check(
    `e: the desk's ⋯ names the fleet's new answer, “${fleetsAllow}”, still the one checked`,
    named.items[0]?.name === fleetsAllow && named.items[0].checked,
    JSON.stringify(named.items)
  );

  // (f)
  await choose("desk", UPSTREAM_WORDS.keepOff);
  released.add("Q");
  check(
    "f: the desk's ⋯ › “Keep agents off other repositories” sets the project's own answer over the fleet's yes",
    (await until(
      "f: the project's own answer",
      projectPosts,
      (now) => now === "off",
      15_000
    ).catch(projectPosts)) === "off",
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("K", 300_000);
  check(
    "f: kept off by its own answer while the fleet lets agents post, K, E again, is refused by the GitHub door",
    exitOf("K") !== 0 && said("Q", "K").includes(ELSEWHERE_REFUSED),
    `exit ${exitOf("K")}; said:\n${said("Q", "K")}`
  );

  // (g)
  await choose("desk", UPSTREAM_WORDS.ask);
  released.add("R");
  check(
    "g: the desk's ⋯ › “Ask me first” sets the project's own answer",
    (await until(
      "g: the project's own answer",
      projectPosts,
      (now) => now === "ask",
      15_000
    ).catch(projectPosts)) === "ask",
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("4", 300_000);
  const heldAsks = async () =>
    (await fleet.api<HeldAsk[]>("/api/pending")).filter(
      (one) => one.payload.toolName === UPSTREAM_POST_TOOL
    );
  const parked = await until(
    "g: the three posts parked",
    heldAsks,
    (all) => all.length >= 3,
    30_000
  ).catch(heldAsks);
  const titled = (title: string) =>
    parked.find((one) => one.payload.input.title === title);
  const deniedAsk = titled("Probe deny");
  const approvedAsk = titled(APPROVED_BRANCH);
  const otherRepo = "127.0.0.1/someone/else";
  check(
    "g: S1 is held at the GitHub door, not sent: the session reads that it waits in the owner's Needs you",
    said("R", "1").includes(HELD),
    `exit ${exitOf("1")}; said:\n${said("R", "1")}`
  );
  check(
    "g: S2, the same post again, is that one ask: the session reads it is already waiting",
    said("1", "2").includes(AGAIN) &&
      parked.filter((one) => one.payload.input.title === "Probe deny")
        .length === 1,
    `exit ${exitOf("2")}; ${parked.length} asks; said:\n${said("1", "2")}`
  );
  check(
    "g: S3, a push to someone/else.git on a host that is not GitHub, is held at the git door, sent nowhere: the session reads that it waits, and the repository took no push",
    said("2", "3").includes(HELD) && elsewhere.pushes(ELSE_REPO) === 0,
    `exit ${exitOf("3")}; pushes ${elsewhere.pushes(ELSE_REPO)}; said:\n${said("2", "3")}`
  );
  check(
    "g: S1's card names github.com/someone/else, an issue, its title and body, the host's GitHub login, and the request",
    Boolean(
      deniedAsk &&
      deniedAsk.payload.input.repo === "github.com/someone/else" &&
      deniedAsk.payload.input.kind === "issue" &&
      deniedAsk.payload.input.body === "Denied body" &&
      deniedAsk.payload.input.account === `@${PERSON}` &&
      deniedAsk.payload.presentation?.summary ===
        "Post an issue on github.com/someone/else" &&
      deniedAsk.payload.presentation.detail === `As @${PERSON} on GitHub` &&
      deniedAsk.payload.presentation.command ===
        "POST api.github.com/repos/someone/else/issues"
    ),
    JSON.stringify(deniedAsk?.payload)
  );
  check(
    `g: S3's card names ${otherRepo}, a push of ${APPROVED_BRANCH}, the host's own git sign-in on that host, and the push`,
    Boolean(
      approvedAsk &&
      approvedAsk.payload.input.repo === otherRepo &&
      approvedAsk.payload.input.kind === "push" &&
      approvedAsk.payload.input.account === "this machine's git sign-in" &&
      approvedAsk.payload.presentation?.summary ===
        `Post a push on ${otherRepo}` &&
      approvedAsk.payload.presentation.detail ===
        "As this machine's git sign-in on 127.0.0.1" &&
      (approvedAsk.payload.presentation.command ?? "").startsWith(
        `git push ${otherUrl} `
      )
    ),
    JSON.stringify(approvedAsk?.payload)
  );
  const commentAsk = parked.find((one) => one.payload.input.kind === "comment");
  check(
    "g: S4, a comment on someone/else's issue 12, is held at the GitHub door: the session reads that it waits",
    said("3", "4").includes(HELD) && Boolean(commentAsk),
    `exit ${exitOf("4")}; said:\n${said("3", "4")}`
  );
  // Each held post's row in the desk's Needs you names the post: its own
  // title (a comment's first line) over where it goes, owner/repo#n, and the
  // session that asked on its last line.
  await openNeeds(pages.desk, "desk", base);
  await pages.desk
    .locator(ASK_ROW)
    .filter({ hasText: "Probe comment" })
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  const heldRows = await pages.desk.evaluate((selector) => {
    const line = (row: Element, slot: string) =>
      (row.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
    return [...document.querySelectorAll(selector)].map((row) => ({
      name: line(row, "name"),
      want: line(row, "want"),
      meta: line(row, "meta"),
    }));
  }, ASK_ROW);
  const rowOf = (name: string) => heldRows.find((row) => row.name === name);
  const asker = (ask: HeldAsk | undefined) =>
    ask?.payload.presentation?.asker ?? "";
  check(
    "g: a held post's row in Needs you shows its title and owner/repo#n, and the session that asked: S1 'Probe deny' over someone/else, S4 'Probe comment' over someone/else#12",
    rowOf("Probe deny")?.want === "someone/else" &&
      rowOf("Probe comment")?.want === "someone/else#12" &&
      asker(deniedAsk) !== "" &&
      Boolean(rowOf("Probe deny")?.meta.includes(asker(deniedAsk))) &&
      Boolean(rowOf("Probe comment")?.meta.includes(asker(commentAsk))) &&
      !rowOf("Probe comment")?.meta.includes("Permission"),
    `asker ${JSON.stringify(asker(deniedAsk))}; rows ${JSON.stringify(heldRows)}`
  );
  /**
   * A held post's row in Caw's Needs you, found by what the row draws (its
   * title), its button `name`
   * pressed as `view`'s hand presses it.
   */
  const answerRow = async (view: View, drawn: string, name: string) => {
    const page = pages[view];
    await openNeeds(page, view, base);
    const row = page.locator(ASK_ROW).filter({ hasText: drawn });
    await row.first().waitFor({ timeout: 30_000 });
    await row
      .first()
      .getByRole("button", { name: new RegExp(`^${name} `) })
      .evaluate((button) => button.setAttribute("data-probe-pick", ""));
    await press(page, view, "[data-probe-pick]");
    await settle(page, 300);
  };
  // S1's row: its title.
  await answerRow("desk", "Probe deny", "Deny");
  const toldDenied = await until(
    "g: the session hears the denial",
    () => seen,
    (heard) => heard.includes("The owner denied"),
    120_000
  ).then(
    () => true,
    () => false
  );
  check(
    "g: Deny on S1's row at the desk: its ask goes, and the session is told",
    toldDenied &&
      !(await heldAsks()).some((one) => one.requestId === deniedAsk?.requestId),
    `told ${toldDenied}`
  );
  await answerRow("phone", APPROVED_BRANCH, "Approve");
  const toldApproved = await until(
    "g: the session hears it was posted",
    () => seen,
    (heard) => heard.includes("The owner approved"),
    120_000
  ).then(
    () => true,
    () => false
  );
  // Posted once: a second push would land within the wait.
  await Bun.sleep(5000);
  const landed = (
    await Bun.$`git -C ${elsewhere.dir(ELSE_REPO)} rev-parse --verify --quiet refs/heads/${APPROVED_BRANCH}`
      .nothrow()
      .text()
  ).trim();
  const heldSha = (approvedAsk?.payload.input.body as string | undefined)
    ?.split(" ")[0]
    ?.replace(FORCED, "");
  check(
    "g: Approve on S3's row on the phone: the host pushes exactly that commit to someone/else.git once, and the session is told",
    toldApproved &&
      elsewhere.pushes(ELSE_REPO) === 1 &&
      landed !== "" &&
      landed === heldSha,
    `told ${toldApproved}; pushes ${elsewhere.pushes(ELSE_REPO)}; landed ${landed}, held ${heldSha}`
  );
  elsewhere.stop();
  githubApi.stop(true);
  kit.note(`captures: ${kit.out}`);
};

/** A post held for the person, as `/api/pending` lists it. */
interface HeldAsk {
  instanceId: string;
  payload: {
    input: Record<string, unknown>;
    presentation?: {
      asker?: string;
      command?: string;
      detail?: string;
      summary?: string;
    };
    toolName: string;
  };
  requestId: string;
}

export default { name: "upstream-guard", run } satisfies Spec;
