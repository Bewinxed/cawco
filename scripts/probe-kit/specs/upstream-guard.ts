/**
 * The upstream guard (core upstream-guard.ts, agent upstream-shim.ts, hub
 * upstream.ts), its choice made where the owner put it: Caw's Needs you
 * while the fleet's is unanswered (the onboarding row, NeedsCard), and each
 * project's ⋯ menu (UpstreamMenu). While the choice keeps agents off other
 * people's repositories, a write to one does not run, and the session reads
 * why. On a scratch fleet (real hub, agent and sessiond; Claude Code against
 * the mock model), boundaries included: run it where a workspace boundary
 * can start (not inside another one).
 *
 * A fake `gh` first on the services' PATH records each call it runs, with
 * the GitHub token it ran with and whether its config sends it through the
 * workspace's GitHub door, in the workspace's TMPDIR; the boundary's guard
 * shim stands before it. On the host it is the agent's gh too, whose
 * `gh auth token` answers `probe-host-token`. The services run with a
 * caller's `GH_TOKEN` (`probe-caller-token`), as a person's shell may. The
 * project is a checkout with no origin of its own, so the hub is its remote
 * and a workspace's push goes through the workspace's git door, as it does
 * for every project whose remote is the hub. (A clone keeps its source's
 * own origin, clone.ts, and a local path outside the clone is no origin a
 * boundary can write, guarded or not.) Its remote is recorded as
 * github.com/probe-owner/probe-repo, as a GitHub checkout's would be.
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
 *       its request reaches the workspace's GitHub door, which refuses it;
 *     Z the real curl straight to the door's socket, the same POST: refused;
 *     P `git commit` and `git push` to the clone's origin: lands;
 *     and B's gh ran with no token at all, its config naming the door.
 * (c) ⋯ › "Let agents post upstream" at the desk: the hub has the project's
 *     own `true` over the fleet's; its rule turns unguarded within a beat,
 *     and E, A again, runs; U its commands carry the caller's token again.
 * (d) ⋯ › "Same as the fleet" on the phone: the project's own answer goes
 *     (null) and it follows the fleet's, keep off: its rule turns guarded
 *     within a beat, and F, A again, is refused.
 * (e) The fleet's answer turned to "Let agents post upstream" (PUT, as a
 *     setup page's card sends it): the project, still the fleet's, turns
 *     unguarded within a beat and I, A again, runs; the desk's ⋯ names the
 *     fleet's new answer beside "Same as the fleet".
 * (f) ⋯ › "Keep agents off other repositories" at the desk: the project's
 *     own `false` over the fleet's yes; its rule turns guarded within a
 *     beat, and K, A again, is refused.
 *
 *   bun scripts/probe-kit/run.ts upstream-guard
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one hand, one step at a time.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: the scenario runs in order, one choice after the last.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { UPSTREAM_WORDS } from "../../../packages/core/src/upstream-guard";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";

const TAG = "PROBE-UPSTREAM";
const OWN = "probe-owner/probe-repo";
const NAME = "Upstream guard";
/** The guard's refusal, as the session reads it (upstream-guard.ts `upstreamRefusal`). */
const REFUSED = (what: string, repo: string) =>
  `cawco: \`${what}\` did not run: it writes to ${repo}, and this project's repository is github.com/${OWN}.`;
const DRAFT = "Put what you would have posted";

/** The real gh on this host, found before the fake goes first on PATH: what step X runs by its path. */
const REAL_GH = Bun.which("gh") ?? "/usr/bin/gh";
/** The real curl, by its path past the guard's shim: what step Z sends by hand. */
const REAL_CURL = Bun.which("curl") ?? "/usr/bin/curl";
/** The door's refusal of a POST to repos/x/y/issues (github-door.ts). */
const DOOR_REFUSED =
  "cawco: `POST api.github.com/repos/x/y/issues` did not run: it writes to github.com/x/y";
const TOKEN_VARS = (id: string) =>
  `echo "TOKENVARS-${id}=$(env | grep -cE '^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)=')"`;
const TOKEN_COUNT = (id: string) => new RegExp(`TOKENVARS-${id}=(\\d+)`);
const MUTATION_NO_REPO = `gh api graphql -f 'query=mutation { addComment(input: {subjectId: "X", body: "hi"}) { clientMutationId } }'`;
const MUTATION_OWN = `gh api graphql -F owner=probe-owner -F name=probe-repo -f 'query=mutation($owner: String!, $name: String!) { r: repository(owner: $owner, name: $name) { id } }'`;
const ELSEWHERE = "gh issue create -R someone/else --title t --body b";
/** Waits inside the boundary until the workspace's rule reads `guarded`. */
const RULE_READS = (guarded: boolean) =>
  `until grep -q '"guarded":${guarded}' "$HOME/.cawco/workspaces/$CAWCO_WORKSPACE/ro/upstream.json"; do sleep 1; done`;

/** Each step's command, in order; each ends by echoing its marker and the exit. */
const STEPS = [
  { id: "A", command: ELSEWHERE },
  { id: "B", command: `gh issue create -R ${OWN} --title t --body b` },
  { id: "C", command: "gh api repos/x/y/issues -f title=t" },
  { id: "D", command: "gh api repos/x/y/issues" },
  { id: "T", command: TOKEN_VARS("T") },
  { id: "G", command: MUTATION_NO_REPO },
  { id: "H", command: MUTATION_OWN },
  { id: "X", command: `${REAL_GH} api repos/x/y/issues -f title=t 2>&1` },
  {
    id: "Z",
    command: `sock=$(sed -n 's/^http_unix_socket: "\\(.*\\)"$/\\1/p' "$GH_CONFIG_DIR/config.yml"); ${REAL_CURL} -s --unix-socket "$sock" -X POST http://api.github.com/repos/x/y/issues -d '{"title":"t"}'`,
  },
  {
    id: "P",
    command:
      "set -o pipefail; git -c user.name=Delegate -c user.email=d@probe.test commit -q --allow-empty -m 'Probe push' && git push origin HEAD:refs/heads/probe-push 2>&1 | sed 's/^/PUSH-OUT /'",
  },
  // Each wait holds until the probe has pressed the next choice, then until
  // that choice has reached the workspace's rule.
  { id: "W", command: RULE_READS(false) },
  { id: "E", command: ELSEWHERE },
  { id: "U", command: TOKEN_VARS("U") },
  { id: "V", command: RULE_READS(true) },
  { id: "F", command: ELSEWHERE },
  { id: "Y", command: RULE_READS(false) },
  { id: "I", command: ELSEWHERE },
  { id: "Q", command: RULE_READS(true) },
  { id: "K", command: ELSEWHERE },
] as const;
type StepId = (typeof STEPS)[number]["id"];
/** The waits, each let go once the probe has pressed the choice it waits on. */
const WAITS: readonly StepId[] = ["W", "V", "Y", "Q"];
const released = new Set<StepId>();
const marker = (id: StepId) => `STEP-${id}-END`;
const EXIT = /STEP-([A-Z])-END exit=(\d+)/g;
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
              command: `${step.command}; echo "${marker(step.id)} exit=$?"`,
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
# The probe's stand-in for gh: the host's token, or the call recorded with the
# token it ran with where the probe reads it.
if [ "$1 $2" = "auth token" ]; then echo probe-host-token; exit 0; fi
case "$(cat "$GH_CONFIG_DIR/config.yml" 2>/dev/null)" in *http_unix_socket*) door=yes ;; *) door=no ;; esac
printf '%s token=%s door=%s\\n' "$*" "\${GH_TOKEN:-none}" "$door" >> "$TMPDIR/fake-gh.log"
echo "FAKE-GH-RAN $*"
`;

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

const NEEDS_ROW = '.caw-pop .row[data-kind="choice"]';
const OPEN_MENU = "[data-slot='dropdown-menu-content'][data-state='open']";
const OPEN_SUB = "[data-slot='dropdown-menu-sub-content'][data-state='open']";
const SUB_TRIGGER = `${OPEN_MENU} [data-slot='dropdown-menu-sub-trigger'][data-probe-upstream]`;

/** Caw's panel opened from his head in the bar, as a hand opens it. */
const openNeeds = async (page: Page, view: View, base: string) => {
  await open(page, base, "[data-needs-caw]");
  await press(page, view, "[data-needs-caw]");
  await page.waitForSelector(".caw-pop[data-shown]", { timeout: 30_000 });
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
  const list = row.closest(".list") ?? row.closest(".caw-pop");
  return {
    name: shown(row.querySelector(".name")),
    want: shown(row.querySelector(".want")),
    meta: shown(row.querySelector(".meta")),
    opens: row.querySelector("a.cover") !== null,
    row: box(row),
    sideways: list ? list.scrollWidth - list.clientWidth : -1,
    buttons: [...row.querySelectorAll(".peers button")].map((button) => {
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
    }),
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
    name: NAME,
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  /** The project's own answer at the hub: null while it takes the fleet's. */
  const projectPosts = () => {
    const [row] = fleet.query<{ upstream_posts: number | null }>(
      "SELECT upstream_posts FROM projects WHERE id = ?",
      project.id
    );
    return row?.upstream_posts === null || row === undefined
      ? null
      : row.upstream_posts === 1;
  };
  const fleetAnswer = async () =>
    (
      (await (await fetch(`${fleet.base}/api/fleet/choices`)).json()) as {
        upstream?: boolean | null;
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
    const [keep, allow] = read?.buttons ?? [];
    check(
      `a, ${view}: Needs you asks it in one row: its title, its risk, onboarding's line, and opens nothing`,
      read?.name === UPSTREAM_WORDS.title &&
        read.want === UPSTREAM_WORDS.risk &&
        read.meta === "Onboarding · each project can change it" &&
        !read.opens,
      JSON.stringify(read && { ...read, buttons: undefined })
    );
    check(
      `a, ${view}: its two options are peers (one width, one height, one fill), keep off first, inside the row, each the hit test's at its centre; nothing scrolls sideways`,
      Boolean(
        read &&
        keep &&
        allow &&
        read.buttons.length === 2 &&
        keep.label === UPSTREAM_WORDS.keepOff &&
        allow.label === UPSTREAM_WORDS.allow &&
        Math.abs(keep.width - allow.width) <= 0.5 &&
        Math.abs(keep.height - allow.height) <= 0.5 &&
        keep.fill === allow.fill &&
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
  await press(pages.phone, "phone", `${NEEDS_ROW} .peers button:first-of-type`);
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
    "a: the phone's “Keep agents off other repositories” answers the fleet's choice (false), and the row leaves the phone and the desk",
    answered === false && gone.every(Boolean),
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
      `m, ${view}: three radio items in UPSTREAM_WORDS' words, “${fleetsKeepOff}” the one checked (the fleet's answer its own second line), each whole and the hit test's at its centre`,
      menu.items.map((item) => item.name).join(" | ") ===
        [fleetsKeepOff, UPSTREAM_WORDS.keepOff, UPSTREAM_WORDS.allow].join(
          " | "
        ) &&
        menu.items.map((item) => item.lines).join() === "2,1,1" &&
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
      checks: [{ name: "Probe check", command: "true" }],
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
  /** How many times the fake gh ran a write to someone/else: each one the guard let through. */
  const elsewhereRan = async () =>
    (await logged())
      .split("\n")
      .filter((line) => line.startsWith("issue create -R someone/else")).length;
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
    rule.includes('"guarded":true') &&
      rule.includes(`github.com/${OWN}`) &&
      projectPosts() === null,
    rule
  );
  const calls = await logged();
  const text = latest();
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
    "b: B `gh issue create` against the project's own remote runs, with no token, its config naming the GitHub door",
    exitOf("B") === 0 &&
      lines.some(
        (line) =>
          line.startsWith(`issue create -R ${OWN}`) &&
          line.endsWith("token=none door=yes")
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
    `b: X ${REAL_GH} by its path, api repos/x/y/issues -f title=t, is refused by the GitHub door`,
    exitOf("X") !== 0 &&
      exitOf("X") !== undefined &&
      text.includes(DOOR_REFUSED),
    `exit ${exitOf("X")}`
  );
  check(
    `b: Z ${REAL_CURL} straight to the door's socket, POST repos/x/y/issues, is refused`,
    text.includes(DOOR_REFUSED) && text.split(DOOR_REFUSED).length > 2,
    `exit ${exitOf("Z")}`
  );
  check(
    "b: P git push to the clone's origin (the hub, through the git door) lands",
    exitOf("P") === 0 && PUSHED.test(text),
    `exit ${exitOf("P")}; git said:\n${(text.match(PUSH_LINES) ?? []).join("\n")}`
  );

  // (c)
  await choose("desk", UPSTREAM_WORDS.allow);
  released.add("W");
  check(
    "c: the desk's ⋯ › “Let agents post upstream” sets the project's own answer over the fleet's",
    (await until(
      "c: the project's own answer",
      projectPosts,
      (now) => now === true,
      15_000
    ).catch(projectPosts)) === true,
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("U", 300_000);
  check(
    "c: with the project's own answer, E `gh issue create -R someone/else` runs",
    exitOf("E") === 0 && (await elsewhereRan()) === 1,
    `exit ${exitOf("E")}; fake gh calls:\n${await logged()}`
  );
  const openCount = TOKEN_COUNT("U").exec(latest())?.[1];
  check(
    "c: U unguarded, commands carry the caller's GH_TOKEN as before",
    openCount === "1",
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
    "d: following the fleet's keep off, F `gh issue create -R someone/else` is refused, and the fake gh never ran it",
    exitOf("F") === 1 &&
      said("V", "F").includes(
        REFUSED("gh issue create", "github.com/someone/else")
      ) &&
      (await elsewhereRan()) === 1,
    `exit ${exitOf("F")}; fake gh calls:\n${await logged()}`
  );

  // (e)
  const turned = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upstream: true }),
  });
  released.add("Y");
  await stepRan("I", 300_000);
  check(
    "e: the fleet's answer turned to “Let agents post upstream”, the project, still the fleet's, follows: I runs",
    turned.status === 200 &&
      projectPosts() === null &&
      exitOf("I") === 0 &&
      (await elsewhereRan()) === 2,
    `PUT ${turned.status}; exit ${exitOf("I")}; fake gh calls:\n${await logged()}`
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
      (now) => now === false,
      15_000
    ).catch(projectPosts)) === false,
    `project ${JSON.stringify(projectPosts())}`
  );
  await stepRan("K", 300_000);
  check(
    "f: kept off by its own answer while the fleet lets agents post, K `gh issue create -R someone/else` is refused, and the fake gh never ran it",
    exitOf("K") === 1 &&
      said("Q", "K").includes(
        REFUSED("gh issue create", "github.com/someone/else")
      ) &&
      (await elsewhereRan()) === 2,
    `exit ${exitOf("K")}; fake gh calls:\n${await logged()}`
  );
  kit.note(`captures: ${kit.out}`);
};

export default { name: "upstream-guard", run } satisfies Spec;
