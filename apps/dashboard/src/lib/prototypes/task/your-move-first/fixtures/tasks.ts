/**
 * Project Cawco-Dev's own tasks, copied from the hub's reads (task_read with
 * history, 5 Nov 2026), each at a moment it really stood in: the fields as
 * the hub answered them, cut to what the page draws. Where a task is drawn
 * at a past moment (tsk-142 working, tsk-7 stopped), its history and
 * comments stop at that moment.
 */
import slashCommands from "./slash-commands.png";
import startSessionHarness from "./start-session-harness.png";
import type { TaskRead } from "./types";

/** tsk-218 in review: its attempt handed in a page and a commit; Jev could not show one criterion met. */
export const review: TaskRead = {
  id: "tsk-218",
  title: "Let start_session choose a harness",
  stage: "review",
  kind: "you",
  passOn: "done",
  sendBack: {
    stage: "ready",
    by: "nobody",
  },
  description:
    "start_session takes a `type` but no `harness`, so a live check on pi (or OpenCode) can't be started from it. delegate takes `harness`, but a delegate isn't offered no_reply_needed, which is what tsk-207's pi check needs. Give start_session the same `harness` choice delegate has, resolved the same way.",
  criteria: [
    {
      text: "start_session can start a session on Claude Code, OpenCode or pi",
      met: true,
      score: null,
    },
    {
      text: "tsk-207's pi check can be run from it",
      met: false,
      score: "0.53",
    },
  ],
  todos: [],
  type: "medium",
  labels: ["bug", "fleet"],
  fields: {
    triage: "ready-for-agent",
  },
  filedBy: "Continue CawCo open tasks",
  createdAt: 1_793_668_785_000,
  attempts: [
    {
      id: "67533cef",
      session: {
        id: "7f87d8f5-3b2e-42f2-a0bb-f78a8f9fcf72",
        title: "Let start_session choose a harness",
        state: "ended",
      },
      startedAt: 1_793_681_825_482,
      endedAt: 1_793_682_042_413,
      state: "done",
      endedHow: null,
      headline:
        "start_session now takes the same harness choice as delegate (Claude Code, OpenCode or pi), resolved by the same rule. The repo checks pass.",
    },
  ],
  result: {
    at: 1_793_682_042_413,
    session: {
      id: "7f87d8f5-3b2e-42f2-a0bb-f78a8f9fcf72",
      title: "Let start_session choose a harness",
      state: "ended",
    },
    headline:
      "start_session now takes the same harness choice as delegate (Claude Code, OpenCode or pi), resolved by the same rule. The repo checks pass.",
    report:
      'Deliverable: commit 96be89d53 "start_session takes a harness, resolved as delegate\'s" for [Let start_session choose a harness](cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-218).\n\n- packages/hub/src/delegation-tools.ts: start_session\'s shape gains `harness: z.enum(HARNESSES).optional()` ("Overrides the type\'s. Without a type, a harness other than the \'medium\' type\'s needs a model."). It is passed to actions.startSession. The tool description ends "…on Claude Code, OpenCode or pi as the type or `harness` says."\n- packages/hub/src/delegation-actions.ts: the startSession options gain `harness?: HarnessKind`, which goes to `resolveSpawnType(types, {type, harness, model})`. This is the same resolver delegate uses (work-items.ts settingsOf), so there is no second rule. A type named with a harness or model is overridden by them. A harness with no type must come with a model, unless it is the \'medium\' type\'s own harness; otherwise it is refused with "Name a type, or a model for pi."\n- tsk-207\'s pi check: a start_session session has no workItemId, so roles.ts `allows(row, NO_REPLY_TOOL)` → `talksWithPerson(row)` offers it no_reply_needed. The check can now be started with start_session({harness:"pi", model:<pi model>, cwd, prompt, title}). I did not run it live: that is tsk-207\'s work, and it can be started now.\n\nProof:\n- `bun install` → "1350 packages installed"\n- `bun run check --base origin/main` → exit 0. Its sections include "biome check (186 files) · ok", "knip · ok", "golar lint (185 files) · ok: every rule found its planted mistakes (66) and nothing else", "golar tsc -b (19 projects…) · ok", "packages/hub openapi:check · ok: openapi.json, OpenEnums.swift and the generator config are up to date", "stored-shapes:check · ok". Last line: "check: 60 checks passed in 27.5s". After a one-word description edit I amended the commit, and `bunx biome check` on the file then gave "Checked 1 file … No fixes applied."\n- The repo has no unit test files (`git ls-files | grep -E \'\\.(test|spec)\\.ts$\'` is empty), so there is no spec to extend.\n\nShown with the artifact start-session-harness (the tool as a calling agent reads it, plus the resolution table), handed in with task_result.',
    check: [
      "delegation-tools.ts: start_session has a new `harness` parameter (enum HARNESSES) that is passed through to actions.startSession",
      "delegation-actions.ts startSession: harness goes to resolveSpawnType, the same call delegate's settingsOf makes",
      "bun run check --base origin/main: 60 checks passed",
    ],
    presented: {
      name: "start-session-harness",
      href: "cawco:artifact/49670920-9839-4a66-9476-71292d6333dc",
      picture: startSessionHarness,
    },
    commit: "96be89d53",
  },
  ask: null,
  waits: [],
  unblocks: [],
  history: [
    {
      at: 1_793_668_785_000,
      actor: "Continue CawCo open tasks",
      what: "create “Let start_session choose a harness” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_668_785_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-agent",
      stage: null,
    },
    {
      at: 1_793_681_799_000,
      actor: "Continue CawCo open tasks",
      what: "update type",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_681_825_000,
      actor: "hub",
      what: "stage ready → working",
      reason: "attempt 67533cef started",
      stage: {
        from: "ready",
        to: "working",
      },
    },
    {
      at: 1_793_682_044_000,
      actor: "hub",
      what: "comment “Jev judged the acceptance criteria against the report of it…”",
      reason: "attempt 67533cef judged",
      stage: null,
    },
    {
      at: 1_793_682_044_000,
      actor: "hub",
      what: "stage working → review",
      reason: "attempt 67533cef done; its acceptance criteria wait for you",
      stage: {
        from: "working",
        to: "review",
      },
    },
  ],
  comments: [
    {
      at: 1_793_682_044_614,
      author: "hub",
      text: "Jev judged the acceptance criteria against the report of its attempt [Let start_session choose a harness](cawco:session/7f87d8f5-3b2e-42f2-a0bb-f78a8f9fcf72). Not shown met:\n\n- tsk-207's pi check can be run from it (0.53)",
    },
  ],
  ready: false,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};

/** tsk-226 in ready, waiting on two open decisions and on tsk-18. */
export const waiting: TaskRead = {
  id: "tsk-226",
  title: "Land the Liquid Glass title bars after his two picks",
  stage: "ready",
  kind: "todo",
  passOn: null,
  sendBack: null,
  description:
    "Every bar heading a surface is cut over to DESIGN.md's Title Bars Follow Liquid Glass Rule, checked against Apple's HIG for its kind. The work is on branches cawco/842df988 (efab2908a, workspace 49e12a3c) and cawco/f2b16f38 (16329e130, workspace cf6a001f) on top of it. It covers:\n- Caw's column;\n- the artifact panel head and split;\n- the Comments rail, with search as a glass symbol and rows from the top;\n- the comment thread card;\n- the peek;\n- sheets and drawers;\n- the Configure, Usage and Who decides heads;\n- the browser address in the head.\n\nHis five notes on the artifact panel are built and answered in his pin on title-bars-close. His picks so far: a sheet's Close stays trailing, and the plan card and delegate shelf keep their Close.\n\nStill open on the decision page title-bars-close (109f7c53): whether the phone Comments sheet's Close gets its own group, and what names the artifact at the head of its panel (glyph alone, words, or slug). The cards' canvases are served from workspace cf6a001f.\n\nAfter his picks:\n- apply them;\n- run the comments, comments-drawer-layer and session-sheet probes the last run edited but didn't run;\n- do one scoped read of the sidebar's machine heading contrast (3.52:1 once);\n- land after the design graph (the hold), then ship.\n\nRecords: assets/842df988/design-run.md, design-run-round2.md, assets/f2b16f38/design-run.md.",
  criteria: [
    {
      text: "His two remaining picks are applied",
      met: null,
      score: null,
    },
    {
      text: "The edited probes and the sidebar contrast read pass",
      met: null,
      score: null,
    },
    {
      text: "Both branches land on main after the design graph, and ship in a nightly",
      met: null,
      score: null,
    },
  ],
  todos: [],
  type: null,
  labels: ["design", "owner-ask", "title-bars"],
  fields: {
    triage: "ready-for-agent",
  },
  filedBy: "Continue CawCo open tasks",
  createdAt: 1_793_770_841_000,
  attempts: [],
  result: null,
  ask: null,
  waits: [
    {
      kind: "card",
      label: "What names the artifact at the head of its panel?",
      href: "cawco:decision/109f7c53-44db-47c7-bc7f-7805647dd14a/head-name",
      state: "open",
      settled: false,
      flag: null,
      value: null,
      via: null,
    },
    {
      kind: "card",
      label:
        "On a phone, does the Comments sheet's Close share a group with Search, Sort and Comment on the whole page?",
      href: "cawco:decision/109f7c53-44db-47c7-bc7f-7805647dd14a/rail-close",
      state: "open",
      settled: false,
      flag: null,
      value: null,
      via: null,
    },
    {
      kind: "task",
      label:
        "Replace the component canvas's grid of frames with the design graph",
      href: "cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-18",
      state: "ready",
      settled: false,
      flag: null,
      value: null,
      via: null,
    },
  ],
  unblocks: [],
  history: [
    {
      at: 1_793_770_841_000,
      actor: "Continue CawCo open tasks",
      what: "create “Land the Liquid Glass title bars after his two picks” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_770_842_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-agent",
      stage: null,
    },
    {
      at: 1_793_772_771_000,
      actor: "Continue CawCo open tasks",
      what: "comment “The DESIGN.md cut landed on main at 854292fb9 with his appr…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_803_341_000,
      actor: "Continue CawCo open tasks",
      what: "comment “Rendered checks (triage b7f176e96, assets/460f5ac4/defects.…”",
      reason: null,
      stage: null,
    },
  ],
  comments: [
    {
      at: 1_793_772_771_046,
      author: "Continue CawCo open tasks",
      text: "The DESIGN.md cut landed on main at 854292fb9 with his approval. DESIGN.md is now 7,911 words, `bun run check` fails it above 8,000, and each screen's decisions live in `apps/dashboard/.impeccable/surfaces/`.\n\nThree commits on these branches edit DESIGN.md and will conflict on rebase:\n- cawco/842df988: b1c6f47b5\n- cawco/f2b16f38: 16329e130 and a85a2e568\n\nThe landing brief must:\n- keep main's DESIGN.md;\n- move what each of those commits decided into the screen's surface brief. The artifact panel's brief already holds the 11-03 rail and thread-card picks;\n- put a pick into DESIGN.md only when it changes the whole system.",
    },
    {
      at: 1_793_803_341_298,
      author: "Continue CawCo open tasks",
      text: 'Rendered checks (triage b7f176e96, assets/460f5ac4/defects.md) found four defects in the side card\'s head (lib/cawco/side/SideSurface.svelte, bench /motion/side-head). This task\'s title-bar cutover owns them, so they\'re left for it:\n- **head, 1440:** the To-dos card\'s task id "tsk-2026-10-19-plan" stands as a second line under the title (DESIGN.md: an id never a second line in the bar). It is drawn at SideSurface:498-507; the product caller is PreviewPane:4230 (subtitle={headLine}).\n- **overflow, 390:** Close (274..304) ends 2px past its head (18..302), because the name keeps `min-w-(--name-keeps)` (SideSurface:479) and the controls give way instead (DESIGN.md: in a row the name gives way first).\n- **hidden-cue, 390:** "Plan ⟳ 3/12" is cut by identity\'s overflow-hidden, with 30px hidden and no ellipsis or fade (The Truncate Inside Rule, SideSurface:479).\n- **tight-inset, 1440/390:** "Plan" and "Body" stand 7px from the card\'s left, where the other titles stand at 14px (SideSurface:442, :479, :597).\n\nCheck each once this task\'s branches rebase.',
    },
  ],
  ready: false,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};

/** tsk-18 in ready, opened from tsk-226's wait row: 28 tasks wait on it. */
export const waitedOn: TaskRead = {
  id: "tsk-18",
  title: "Replace the component canvas's grid of frames with the design graph",
  stage: "ready",
  kind: "todo",
  passOn: null,
  sendBack: null,
  description:
    "The component canvas's grid of frames is replaced by the design graph: the surface where the owner judges what an agent built (a real component or screen in each of its states, the moves between them and their timing) and leaves remarks the agent reads back.\n\n### How it is being done (from 2026-11-01)\n1. A fresh judgement of the current design, served as it stands with none of its history: a walk of his tasks, the bar set by Apple's HIG and small teams' products, a critique, and a verdict (streamline it, or make it again from the walk), written as a spec.\n2. His answers to the spec's open questions, on one decision page.\n3. A design run on a branch, built to the spec with real components, shown to him as a live preview.\n\nThe run's prompts and the gates between phases: assets/27b63752/run-prompt.md. Nothing lands on main before his go; it ships in a nightly after.\n\nEarlier rounds, branches, picks and runs are history. No design run reads them.",
  criteria: [],
  todos: [],
  type: null,
  labels: ["canvas/artifacts", "partial", "owner-ask"],
  fields: {
    priority: "high",
    triage: "ready-for-human",
  },
  filedBy: "Orchestrate cockpit fleet work",
  createdAt: 1_792_782_116_000,
  attempts: [],
  result: null,
  ask: null,
  waits: [],
  unblocks: [
    {
      id: "tsk-24",
      title:
        "Redesign the comment surfaces: card, thread popover, author row and tablet panel, with one goo-out morph",
      stage: "ready",
    },
    {
      id: "tsk-26",
      title: "Set up the cawco address as one tray led by caw the character",
      stage: "ready",
    },
    {
      id: "tsk-28",
      title: "Pick and build the plan view (tasks and to-dos)",
      stage: "ready",
    },
    {
      id: "tsk-31",
      title: "Settle presence across devices and the away notes",
      stage: "ready",
    },
    {
      id: "tsk-47",
      title:
        "Ask for a sentence-shaped approval card when an agent edits an MCP",
      stage: "ready",
    },
    {
      id: "tsk-48",
      title: "Preview non-HTML projects by falling back to HTML elements",
      stage: "ready",
    },
    {
      id: "tsk-62",
      title: "Give workflows a home of their own, apart from routines",
      stage: "ready",
    },
    {
      id: "tsk-64",
      title: "Make a session at its limit read as a short wait, not a failure",
      stage: "ready",
    },
    {
      id: "tsk-72",
      title: "Restyle Caw's suggestions from the design system up",
      stage: "ready",
    },
    {
      id: "tsk-79",
      title: "Let comments carry pictures and attachments",
      stage: "ready",
    },
    {
      id: "tsk-82",
      title: "Settle one error-state and one placement rule for every surface",
      stage: "ready",
    },
    {
      id: "tsk-83",
      title:
        "Rebuild the design previews' state switcher to the state-machine spec",
      stage: "ready",
    },
    {
      id: "tsk-84",
      title: "Build the transcript cold load he specified",
      stage: "ready",
    },
    {
      id: "tsk-101",
      title: "Show him the reusable Caw rig and its cheer options",
      stage: "ready",
    },
    {
      id: "tsk-104",
      title:
        "Redesign the add-machine modal from scratch, minimizable while it works",
      stage: "ready",
    },
    {
      id: "tsk-156",
      title: "Design and build the decision surface",
      stage: "ready",
    },
    {
      id: "tsk-163",
      title:
        "Show states of projects without stories by route (route-addressed stage)",
      stage: "dropped",
    },
    {
      id: "tsk-164",
      title: "Redesign the decision page from a clean slate",
      stage: "ready",
    },
    {
      id: "tsk-171",
      title:
        "Show him the layered Caw mode picker and the New conversation chip",
      stage: "ready",
    },
    {
      id: "tsk-173",
      title: "Get his look on the comment goo and measure it in real Safari",
      stage: "ready",
    },
    {
      id: "tsk-203",
      title: "Give the project's memory inbox a screen",
      stage: "ready",
    },
    { id: "tsk-210", title: "Start a task from the app", stage: "ready" },
    {
      id: "tsk-220",
      title:
        "Pick how an account with no 5-hour window looks on the usage screens",
      stage: "ready",
    },
    {
      id: "tsk-226",
      title: "Land the Liquid Glass title bars after his two picks",
      stage: "ready",
    },
    {
      id: "tsk-230",
      title: "Time the design graph in iPhone Safari on the Mac",
      stage: "ready",
    },
    {
      id: "tsk-234",
      title:
        "Add image provider settings to Configure: agy sign-in cell and default provider block",
      stage: "ready",
    },
    {
      id: "tsk-235",
      title:
        "Add image provider settings to Configure: agy sign-in cell and default provider block",
      stage: "dropped",
    },
    {
      id: "tsk-240",
      title: "Show the new build's release notes in the update toast",
      stage: "ready",
    },
  ],
  history: [
    {
      at: 1_792_782_116_000,
      actor: "Orchestrate cockpit fleet work",
      what: "create “Replace the component canvas's grid of frames with the design graph” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_792_782_116_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-human",
      stage: null,
    },
    {
      at: 1_792_945_515_000,
      actor: "Orchestrate cockpit fleet work",
      what: "update description, lands",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_946_928_000,
      actor: "Orchestrate cockpit fleet work",
      what: "comment “Added from the open-items scan, 10-25 evening.”",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_947_437_000,
      actor: "Orchestrate cockpit fleet work",
      what: "comment “20:55: the design graph is off main: revert 8a5ff28b0 (all …”",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_951_128_000,
      actor: "Orchestrate cockpit fleet work",
      what: "comment “10-25 ~21:10, cockpit-d6d16556#aa0f3122: his remaining desi…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_954_071_000,
      actor: "Orchestrate cockpit fleet work",
      what: "comment “cockpit-d6d16556: one more commit, cawco-safe/d6d16556-desi…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_954_980_000,
      actor: "Retro on orchestrator complaints",
      what: "update description",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_987_233_000,
      actor: "Retro on orchestrator complaints",
      what: "comment “Dependency pass 10-26: 17 design decisions now wait on this…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_102_483_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “Correction, 10-27: the ultrawide question isn't unanswered.…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_171_998_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “Carried over from tsk-131, closed 10-28: its design questio…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_306_936_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “His direction (10-29): the agent picks the view that fits e…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_306_948_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “His framing (10-29): CawCo gives agents the primitives and …”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_307_646_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “His picks on design-graph-direction (10-29/30): data slider…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_373_168_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “10-30: rebased build is on origin/cawco/df63c567 (17 behind…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_373_882_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “10-30: primitives spec written (assets/613c2692/design-grap…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_424_716_000,
      actor: "Orchestrate CawCo after handover",
      what: "comment “State on 10-31 at 07:30, with all work stopped at his word.”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_448_043_000,
      actor: "Run the ready CawCo tasks",
      what: 'comment “State 10-31 15:30. Clean slate restarted at his pick "All f…”',
      reason: null,
      stage: null,
    },
    {
      at: 1_793_469_655_000,
      actor: "Continue CawCo open tasks",
      what: "comment “10-31 night: his earlier look picks didn't reach the clean-…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_526_674_000,
      actor: "Continue CawCo open tasks",
      what: "Update tasks/tsk-18-replace-the-component-canvas-s-grid-of-frames.md",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_526_674_000,
      actor: "hub",
      what: "comments written by Continue CawCo open tasks put back",
      reason: "comments are added only as task comments",
      stage: null,
    },
    {
      at: 1_793_532_419_000,
      actor: "Continue CawCo open tasks",
      what: "update description",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_602_142_000,
      actor: "Continue CawCo open tasks",
      what: "comment “State 11-02 morning, in plain words.”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_608_973_000,
      actor: "Continue CawCo open tasks",
      what: "comment “State 11-02 ~11:45 local, in plain words.”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_668_777_000,
      actor: "Continue CawCo open tasks",
      what: "comment “From tsk-185, closed 11-03: the component canvas's wall of …”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_770_858_000,
      actor: "Continue CawCo open tasks",
      what: "comment “State on 2026-11-04, before compaction.”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_772_772_000,
      actor: "Continue CawCo open tasks",
      what: "comment “The DESIGN.md cut is on main at 854292fb9. Each screen's de…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_773_674_000,
      actor: "Continue CawCo open tasks",
      what: "comment “11-04 09:35: nightly 6454 (the preview cutover, fe7dadc90) …”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_784_537_000,
      actor: "Continue CawCo open tasks",
      what: "comment “11-04 ~12:30: two design-review rounds are done, both answe…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_790_493_000,
      actor: "Continue CawCo open tasks",
      what: "comment “11-04 ~15:10, state before compaction:”",
      reason: null,
      stage: null,
    },
  ],
  comments: [
    {
      at: 1_792_946_928_126,
      author: "Orchestrate cockpit fleet work",
      text: 'Added from the open-items scan, 10-25 evening.\nHis words: "um but we didn\'t finish the design graph decisions, hello?" / "this is the 9th time i\'m saying this. you went ahead and implemented the design graph without even me finalizing it, this is the 11th time i\'m asking this". Pin cawco:pin/fdba86d8-d081-4b0c-8e77-d098cd846d55/3 "it\'s not growing (attached image.png)" after we said fixed. Notes on design-graph: springs "why restrict yourself to this? the agent is aware of tokens but can do anything needed for the preview, it chooses to use the tokens or adhoc values"; machine-names "neither, the state machines are already namedin the grpah, stop adding redundant/useless copy".\nStill open on his side:\n- Ultrawide room: two pages side by side (current state and hovered preview) or one centred page? Asked 10-21 10:51, never answered.\n- On a phone, name the pinned section always, in the band at the top of the graph? Asked 10-24 20:06, not on any page.\n- Pin cawco:pin/729b1a67-6482-4592-b83b-69fb8b7bdb3f/26 (corner arc vs another handle) never answered; the promised resize-handle page was deleted; round 28\'s handle was never shown to him.\nDecided since: the build comes off main (revert cockpit-25a6279d#150aeee1); it lands from cawco-safe/d6d16556-design-graph only after the pick-by-pick table matches.\nUndelivered promises (mockup 729b1a67, pins 25–30): handle that morphs into the tapered highlight while dragging (26), no persistent drag handle (25), readable labels and highlights (27), popover anchored to the pressed chip (28), show/hide morph like the top-right bar\'s menus (29), clearer section outlines and modern arrows (30). Ten earlier pins (2–22) say "Fixed/Done" about the mockup, never confirmed on the product.\nNext: land only when the table matches every pick and note; prove the card fills his 2529px window (cockpit-864e80fc#50f3f450); answer pins only after his page shows the change; resolve the empty pins (12, 15, 16, 23, 24) on the old mockup. Fold tsk-19 and tsk-20 into this task.',
    },
    {
      at: 1_792_947_437_599,
      author: "Orchestrate cockpit fleet work",
      text: "20:55: the design graph is off main: revert 8a5ff28b0 (all 38 series commits, every later commit kept; the PRD picks commit b280de4d1 stays). The old canvas is back; component-canvas passes. The old canvas's own spec (canvas-design, Chromium) has 5 failures at host load 60–90: four dark-scheme stage-failure legs (12/13/14) passing the 5 s limit only in light, and a 1px light/dark offset at 720 (N7c). Not fixed: the old canvas is what the design graph replaces; if his picks take long, fix these on the old canvas. The build with every pick and note is being prepared on cawco-safe/d6d16556-design-graph.",
    },
    {
      at: 1_792_951_128_568,
      author: "Orchestrate cockpit fleet work",
      text: '10-25 ~21:10, cockpit-d6d16556#aa0f3122: his remaining design-graph picks built on origin cawco-safe/d6d16556-design-graph at 5845daac3 (ff over dce5eecc5; commits 7a47ae4cc leg B, 5845daac3 picks). NOT on main, finish_item not called (it would land). Against his picks/notes: clip kinds "Its own colour per kind" (six kinds opacity/position/size/colour/text/unfold, c-clip-* tokens day+night; enter/change/exit gone) PASS G32 4 widths both engines; clip controls "row" + note "popover? lol.." (inspector, switch and placement code deleted) PASS G10; machine names note "neither… stop adding redundant/useless copy" (band removed, token deleted) PASS G3; springs note (any value, ad-hoc chip only labels) PASS G11/G14; resize "edges" G18/G19; token rule "snap" G13; compare "segments" G16; after edit "replay" G12/G15; change marks "washes" G7; verdict "pins" G17 (pin card still reads "Saving it › Save failed"). Also fixed: playhead read "-2" at play start (clamped). Runs: canvas-design graph Chromium ALL PASS 125, WebKit ALL PASS 125; component-canvas ALL PASS 54; check --all pass. Per-kind contrast table not made (only token-contrast check). Leg B under 5x CPU throttle: 353/353, 353/353, 352/353 — one WebKit fail: side head\'s scrollWidth flips 842↔384 on "window quickly 390→1440→680→390", never settles; suspected fit oscillation in the side head (product defect), unproven, needs its own item. Waiting on: his go to land (hold), then the oscillation item.',
    },
    {
      at: 1_792_954_071_131,
      author: "Orchestrate cockpit fleet work",
      text: 'cockpit-d6d16556: one more commit, cawco-safe/d6d16556-design-graph now at 312a9f7ce (on 5845daac3; picks table unchanged; nothing on main). The 1-of-353 WebKit "window quickly 390→1440→680→390" read is now handled in the spec\'s settle wait (canvas-design.ts HEAD_SETTLED: budget in frames, 300 frames still changing = unsettled; 60 s wall cap; an unsettled read names frames drawn, longest gap, layouts seen). Product untouched. The leaf infers from code (SideSurface fit measures in one ResizeObserver frame, writes the next) that the engine drew no frames for a stretch, not a fit oscillation; it could not reproduce it (20/20, 3/3 on 2 cores, 4/4 at nice 19 on 1 core), so the cause is inferred, not caught. Proof: leg B under 4x throttle ALL PASS (352 B checks, 0 FAIL); check --all 13 passed. The leaf waits for "land it" (finish_item lands on main). Waiting on: his go to land (hold; design build lands only after every pick — all picks are in per the table).',
    },
    {
      at: 1_792_987_233_158,
      author: "Retro on orchestrator complaints",
      text: "Dependency pass 10-26: 17 design decisions now wait on this task (after edges), per the owner's rule that decisions are easier once the design graph is done. Its own landing check (the card filling his 2529px window, tsk-40's width fix 03231b2e3 on main) is acceptance, not a prerequisite, so this task has no after edge to tsk-40.",
    },
    {
      at: 1_793_102_483_939,
      author: "Orchestrate CawCo after handover",
      text: 'Correction, 10-27: the ultrawide question isn\'t unanswered. He picked ultrawide = "pair" on design-graph-screens (fe47ad56) 6 days ago. Take that pick before that page is cleared.',
    },
    {
      at: 1_793_171_998_190,
      author: "Orchestrate CawCo after handover",
      text: "Carried over from tsk-131, closed 10-28: its design questions now wait here. They are whether to keep or drop the 50% dim, and a review of the clock and dollar icons (both kept with their outline on the builder's call in b47aad2bd).",
    },
    {
      at: 1_793_306_936_305,
      author: "Orchestrate CawCo after handover",
      text: "His direction (10-29): the agent picks the view that fits each ask, and he can switch to any other. Views: a step slider above one live component (scrub a sequence), the overview graph (every state and its arrows), and the page-level flow (a journey across pages). Other picks from the 10-29 reference review: Dessn, nim's controls and create-canvas were glimpsed for fit, not adopted wholesale. The graph already renders real components from story files on the stage, and screens compose them (live-components plan). Data sliders over real records are still open on design-graph-direction.",
    },
    {
      at: 1_793_306_947_344,
      author: "Orchestrate CawCo after handover",
      text: "His framing (10-29): CawCo gives agents the primitives and the agent composes the view per ask, not one fixed panel. The primitives: a live stage mounting a real component or screen at a story; a step slider over a sequence of states; the overview graph of states and their arrows; the page-level flow; a data control over real records, if picked; and pins anchored to a state's name. The build spec for the graph should be written as these primitives and how an agent combines them.",
    },
    {
      at: 1_793_307_646_166,
      author: "Orchestrate CawCo after handover",
      text: 'His picks on design-graph-direction (10-29/30): data sliders over real records "Now" (say 1 row or 60, long names on or off); page-to-page flows "Not now"; the real page "yes". Next: write the build spec as primitives the agent composes (live stage at a story, step slider, overview graph, data controls, name-anchored pins; page flow dropped for now), using assets/0b27970e/design-graph-fit.md direction A, then rebase cawco-safe/d6d16556-design-graph onto main and build to the spec. His open-question answers already given: ultrawide = pair (design-graph-screens).',
    },
    {
      at: 1_793_373_168_955,
      author: "Orchestrate CawCo after handover",
      text: "10-30: rebased build is on origin/cawco/df63c567 (17 behind main) with docs/design-graph-inventory.md; the primitives spec was never briefed after the inventory. Now with the Fable advisor cockpit-9ffc866b#c59036cf (spec as composable primitives, direction A, his picks). Next: his taste calls with pictures → preview through the full design approach → his pick → build in slices.",
    },
    {
      at: 1_793_373_882_208,
      author: "Orchestrate CawCo after handover",
      text: "10-30: primitives spec written (assets/613c2692/design-graph-primitives-spec.md, Fable advisor c59036cf): five primitives, 7 slices, round-29 pins mapped (§6), 11 taste calls (§7). Finding: the branch's StateGraph hand-draws the graph against his Svelte Flow rule; slice 3 rebuilds it on @xyflow/svelte. Now: cockpit-da9a5137#38aa0be8 rebases df63c567 onto main, builds slices 1–6 on a branch (never main), with dev switches for calls 1–9, hands up a live preview. Checks 1/2/3/6 running in cockpit-9ed11911#e03c727f. Calls 10 (50% dim on drafts) belongs with tsk-72's suggestions restyle; 11 (clock/dollar outline) goes on the same picture page as the graph's calls. Ultrawide pair is recorded only on design-graph-screens (unsent revision): carry into the PRD in slice 7.",
    },
    {
      at: 1_793_424_716_778,
      author: "Orchestrate CawCo after handover",
      text: "State on 10-31 at 07:30, with all work stopped at his word.\n\n**The branch:** cawco/6c1c85bc at e1c85bb46. It holds:\n- the steps bar in three directions from references, with the field's notches replaced by a marked band;\n- a phone timeline that rests at its head;\n- the `?bare` preview mode;\n- `?step=<story>` and `?dock=folded` addresses;\n- the dock floor and lane-clip fixes;\n- the canvas page with no scrollbar gutter;\n- `GlassGroup` merging its class through `cn`;\n- an async preview build.\n\n**His picks.** They're on [design-graph-controls](cawco:artifact/2a12f9c1-aca0-40e8-8571-787abaf58977), revision 11, with four look cards: bar, wide, count and section.\n- Every option is a live Preview at 1:1: desk at 1280, phone upright at 390, and the wide options at 2560 scrolling sideways.\n- The bar and count options open on Several with the dock folded.\n- The previews are served on 4300 from workspace 10288455.\n- Calls 6 and 7 are settled from references and named in the page's intro.\n- The page was checked only with png reads (see tsk-167).\n\n**Open one-liners** (in tsk-169): whether the folded desk dock should name its move, and the player option's two Play buttons. The serve's shared build folder is filed as tsk-170.\n\n**Next:** his picks, then slice 8 (the skill, DESIGN.md, the PRD ultrawide pair, deleting the preview-only route and script), then his go, then land.",
    },
    {
      at: 1_793_448_043_190,
      author: "Run the ready CawCo tasks",
      text: 'State 10-31 15:30. Clean slate restarted at his pick "All four now". Task model: assets/d657bd8b/tom.md (passed Gate 1). Structures: assets/3aec9fab/options.md, canvases stage-and-shelf, the-neighbourhood, from-and-to, drawn with no Mobbin references, so they are void. Redo from the Architect phase under the current redesigning-ui-clean-slate skill (his Mobbin guidance verbatim). The three prototypers were stopped. Their workspaces 49d9dd3e, e60877d2 and 3564fcc0 are held, to discard. Component under review for the prototypes: StopTrayPick (the Caw-off tray) on main.',
    },
    {
      at: 1_793_469_655_926,
      author: "Continue CawCo open tasks",
      text: "10-31 night: his earlier look picks didn't reach the clean-slate briefs (the task model holds needs, not looks). Handed to all three prototypers as binding, and they carry into the Implementer brief: resize by edges (no persistent handle, tapered highlight while dragging); clip controls in the row; drags snap to tokens, ⌥ frees (chip dashed), ad-hoc values allowed; Original | Edited switch, outlines under Original; replay once after an edit; diff washes (green in/changed, red gone); colour per clip kind; pins carry the state's path; no state-machine name band, state = title + one line; durations in a chip variable first, play aligned to labels, popover next to its chip, morph like top-right menus, clear outlines, current arrows; ultrawide = pair at 2529; page flows not now; real-record counts now. Source: decisions/design-graph/record.json, design-graph-finish, design-graph-direction, tsk-18 description.",
    },
    {
      at: 1_793_602_142_651,
      author: "Continue CawCo open tasks",
      text: "State 11-02 morning, in plain words.\n\nThe corrected run so far:\n- **Phase 1 (advisor):** it judged round 29 and gave the verdict scrap. Spec: assets/51a688eb/spec.md, with his seven answers in its last section.\n- **Phase 3 (design):** it built on branch cawco/1d32fba7. Its run record is assets/1d32fba7/design-run.md.\n- **His 17 pins** on the preview \"design-graph\" (artifact 70ff64bf):\n  - A fix run wrote an interface-craft critique and a root analysis (assets/654a8917/design-run.md: \"Critique\", \"The root\"). It rebuilt the surface around his task with the house's controls.\n  - That rebuild landed on main by mistake and was reverted (main is clean at 201935a66). The work lives on cawco/design-graph (341dea0dd) and cawco/e6447b7c (7da7d9bfa, surface brief rewritten). The preview is served from workspace efa8ba4e.\n- **His answers since:**\n  - The whole set stays a Svelte Flow map, built right. Its earlier faults were the implementation, not the canvas.\n  - The stage changes only on a press.\n  - The view card hangs from the glass the way Caw's top-right group does.\n\nOpen:\n- The fix run cockpit-f7f1011f#01f961a1 has:\n  - five live-check defects: the playhead scale, Play, a crash, the view card closing, PageUp;\n  - the map rebuilt right;\n  - the layout shift on choosing a state;\n  - the stage's nested frame.\n- A pin-by-pin browser check of all 17 pins is running (cockpit-d1cb7f12#c685b169). He says many weren't settled, for example the head's panels not opening like Caw's.\n- He wants the critique discussed with him before more design changes come from it. It hasn't been yet: point by point with him, or a Fable advisor's review first, his choice.\n- The arrangement pick (design-graph-arrangement: beside, below or stage) is still open.\n- Nothing lands on main before his go.",
    },
    {
      at: 1_793_608_973_800,
      author: "Continue CawCo open tasks",
      text: "State 11-02 ~11:45 local, in plain words.\n\nThe build:\n- The design graph is built on branch cawco/56cda86b at 9895116e7, with the run record at assets/56cda86b/design-run.md.\n- It holds:\n  - the Fable advisor's critique, all ten findings (assets/b4f9559a/critique.md); he said to build all of it;\n  - his answers: the whole set is a pan-and-zoom map, the stage changes only on a press;\n  - bits-ui 2.20.3 and dagre 3.1.3.\n- Nothing is on main. The work lands after his go, then ships in a nightly.\n\nThe checks:\n- A Sonnet live check passed 9 of 11 and found 16 of 17 pins settled. Pin 12, arrows over titles, was not traced across every card.\n- Five defects it found are fixed: the drawer's ×, the stage against the drawer, the room overflowing at 1000 px, a short ring, and a retimed clip replaying from 0.\n- A live re-check of those five is running.\n\nOpen:\n- tsk-209: a delegate's preview closes when its session ends, and preview-address returns a stale serve. Being fixed; until then he can't open a lasting preview of the branch.\n- His questions, to ask once the re-check is in:\n  - keep the bits-ui patch until upstream ships its two fixes, or drop it;\n  - pin 3: make group heads column heads, a DESIGN.md deviation;\n  - whether a width pick replays the move.\n- His pick on design-graph-arrangement: beside, below or stage.\n- Gaps carried:\n  - hardening stories not added;\n  - on open at 900 px, the form's top is cut by about 80 px;\n  - the routine form's week strip crowds at 390 (tsk-211).",
    },
    {
      at: 1_793_668_777_265,
      author: "Continue CawCo open tasks",
      text: "From tsk-185, closed 11-03: the component canvas's wall of frames is slow in iPhone Safari. PRD §5.10 has the design graph replace that wall, so it's written here and the old code is left alone. The design graph on iPhone Safari needs its own speed check before it lands.",
    },
    {
      at: 1_793_770_858_918,
      author: "Continue CawCo open tasks",
      text: "State on 2026-11-04, before compaction.\n\n**Where the work is**\n- **Build to land:** cawco/d92607fa (f28f5fdd4, workspace 2f5ab7fe). It holds every earlier design-graph branch (cawco/bbc32553 → 65aa61f3 → e987fa08) plus the timeline rebuilt through the full pipeline (assets/d92607fa/design-run.md).\n- **Previews:**\n  - design-graph (70ff64bf) draws, served from workspace 8c4a42ac, an older head.\n  - design-graph-animation-r29 (3360f51d) carries the rebuilt timeline, and 502s until tsk-224 ships.\n- **Not yet wired:** not wired into the artifact panel; nothing on main.\n\n**His decision via the retro session cockpit#2c49c7dc**\n- One fresh `design` session designs the whole screen as one layout. Dispatch it when previews stay up (after tsk-224).\n- Its brief is under 300 words: what he asked and saw, the screen by its path (/dev/design-graph), its states. `owns` is apps/dashboard/src/lib/cawco/graph/**, `from` the latest design-graph workspace, lands branch.\n- No pin lists, no round 29, no file lists, no checks. The run takes the screen as it stands. Pins 27–28 (the View card's clipped toggles; Width laid out as a column while Appearance is a row) and the stage misalignments (stage title ~17px off the form, a half-width Time zone, a label cut at the top) are not separate work.\n\n**After it hands up**\n1. Gate on its design-run.md: References, Judge, Build, and Use, with every state and opened layer at 1440 and 390.\n2. Start a `design-review` delegate from its workspace, lands none. Its brief is the preview's address and what a person comes to the screen to do.\n3. On ship, artifact_show. On fix or rebuild, send one handoff to the design session, then a fresh review. After two rounds he sees it, with what stays open named.\n4. If `design-review` isn't a listed type yet, hold the hand-up.\n\n**Also open on the branch**\n- LinkDown's dimmed stage is under 4.5:1 by day.\n- The map's machine group head sits 5.9px from its edge at 2529.\n- A multi-stretch row's end step is held by its set-off.\n- His earlier click left a stray tuned record on 3360f51d (Create routine delay 401/duration 93). He presses Reset, or I clear it on his word.\n\n**Then:** his go lands the branch, wires it into the artifact panel, ships, and lifts the design graph hold. After that, tsk-216, tsk-211, tsk-203/210, tsk-220 and tsk-226 follow.",
    },
    {
      at: 1_793_772_772_816,
      author: "Continue CawCo open tasks",
      text: "The DESIGN.md cut is on main at 854292fb9. Each screen's decisions now live in `apps/dashboard/.impeccable/surfaces/`, and DESIGN.md takes only system-wide picks. cawco/d92607fa doesn't edit DESIGN.md, so it rebases cleanly. In the whole-screen brief, the design graph's decisions go in its surface brief. When the run starts, send its session link to the retro session (cockpit#2c49c7dc), as it asked.",
    },
    {
      at: 1_793_773_674_833,
      author: "Continue CawCo open tasks",
      text: "11-04 09:35: nightly 6454 (the preview cutover, fe7dadc90) is installed on all four machines, and his previews draw again: 3360f51d, 70ff64bf, e93a0891 and 11bbfb26 all render.\n\nThe whole-screen run has started: [Design the design graph screen whole](cawco:session/8704a140-cfa8-4c54-8833-36872bab0ea7), cockpit-221eff85#8704a140.\n- Type `design`, from 2f5ab7fe (cawco/d92607fa), lands on a branch, owns `graph/**`.\n- Brief under 300 words; the screen's decisions go in its surface brief.\n\nNext:\n1. Gate on its design-run.md.\n2. Run `design-review` from its workspace, lands none.\n3. Ship, or one handoff and a fresh review; after two rounds he sees it.\n\nThe retro session cockpit#2c49c7dc has the link.",
    },
    {
      at: 1_793_784_536_984,
      author: "Continue CawCo open tasks",
      text: "11-04 ~12:30: two design-review rounds are done, both answering fix.\n- Round 1 (cockpit-fc2fe27c): 10 fixes, all made.\n- Round 2 (cockpit-fe2a8c8a): 8 fixes plus 7 smaller findings. The main ones:\n  - Roster states draw wrong, because the fixture takes its args once;\n  - Play ignores the drawn timeline (negative currentTime);\n  - a quick press back strands the stage;\n  - changes are out of sight on the phone and after Compare;\n  - a move can't be chosen;\n  - Compare never shows the other state;\n  - timeline rows can't be told apart;\n  - the layout jumps after opening.\n\nPer the two-round rule, he has the preview [design-graph-one-grid](cawco:artifact/6fde362d-5adf-41d9-bcb0-3681c0c7a440) (branch cawco/7735474b at 7698b7804) with these named as open. The design session cockpit-221eff85#8704a140 is fixing them now.",
    },
    {
      at: 1_793_790_493_581,
      author: "Continue CawCo open tasks",
      text: "11-04 ~15:10, state before compaction:\n- **Branch:** cawco/7735474b at 1a98ddfac. It holds the one-grid screen, rounds 1–2 review fixes, runs as own bars on interact.js, the move picker, side-by-side Compare, and the Vite watch fix. Preview: design-graph-one-grid (6fde362d).\n- **His objection:** the Animation face's controls were never built from a user story (row vs chevron open different things; the clip editor is a form).\n- **Decided:** stories first. Fresh design session cockpit-9f772746#95c265c5 works from tom.md T3/T9/T18 with interface-craft critique, then a step→control map in design-run.md, then the build. Round-3 review defects are handed in:\n  - tuning lost on move switch, and a per-move tuned record;\n  - measured-time jitter;\n  - the ruler cap;\n  - the phone lane is too narrow and its touch targets cover the bars;\n  - Compare lines.\n- **Old session:** cockpit-221eff85 stopped; its workspace is held with 1 uncommitted file, to discard.\n- **Next:**\n  1. Load the preview cold myself.\n  2. Run a design-review against the step map.\n  3. Show him.\n  4. On his go: land, wire into the artifact panel, ship, lift the hold.",
    },
  ],
  ready: true,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};

/** tsk-142 on 26 Oct at 15:36, its second attempt working; the first left ten offered to-dos. */
export const working: TaskRead = {
  id: "tsk-142",
  title:
    "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
  stage: "working",
  kind: "active",
  passOn: null,
  sendBack: null,
  description:
    "The person reported (thread e9e429d6, 2026-10-26):\n- Caw's chat does not use the same primitives as the transcript. His queued messages show below a message he already sent and Caw already answered, so the order is wrong.\n- In Caw's chats the bottom part is faded and hides one of the messages, the same issue. He asked whether Caw chats and normal session chats use different UI components.\n- First, trace why Caw's chats use different components at all, and whether that was intentional.\n- It looks like a workaround; he asked how other products do this. The Caw session is a session in the end. The UI part and the behaviour part are not tied together, so even a stand-in session can use the same UI elements and the push, search and other logic.\n- He then said to go ahead.\n\nScreenshots are readable only on the hub's machine, in /home/bewinxed/.cawco/workspaces/6c2bfe58-caw/ro/claude-tmp/claude-1000/-home-bewinxed-cockpit/c09149ef-d44a-43e0-a46a-f4c6e951b179/images/:\n- **6.png:** in Caw's panel, a message sent while Caw worked (telling Caw it has Mobbin access) is merged into the previous \"You\" bubble, with no queued state.\n- **7.png:** the panel's last rows sit under the bottom fade and can't scroll clear.\n\nThe design, the trace, the signatures in build order and the reasoning are in assets/10d0b2d5/tsk-142-advice.md. Read it whole first; it is the spec.\n\nTrace (origin/main at 6412d0059; the full reading is in the advice file):\n- c23399e8d (7 Oct) drew a thread with the transcript's components by shaping thread messages into a stand-in SessionState. c0e1fac5b (16 Oct) moved that shaping into thread-blocks.ts `threadBlockOf`. Only the drawing was shared.\n- A thread message from the composer goes `sayInThread` → `POST …/threads/:id/messages` → a `thread_messages` row under the composer's id → `wakeForYou` → one wrapped message to Caw's session under a **different** uuid.\n  - The thread row never gets a send state and is ordered by when it was written. So a message sent mid-turn stands above Caw's reply to the earlier one, grouped into its bubble (rows.ts `wellRunsFrom`).\n  - Nothing says \"queued\": MessageRow `whoNote` reads `state`, which a thread row lacks.\n- The other path already does it right. A person's words sent to Caw's own session (`deliverSend` → `toCawThread` → caw.ts `personSent`) keep the thread message under the send's uuid and wake Caw under the same uuid.\n- Push: a Caw reply notifies nobody (`push.turnEnded` skips `role === \"lead\"`; `said()` only publishes).\n- Search: thread words are indexed at the hub (`db.find.threadWords`); one `find` covers them.\n- The fade:\n  - 518fcbe10's `--fade-foot` is read by BlockPage only.\n  - The thread tab's `FootFade` solid run is measured, while the transcript's foot room is computed from tokens and the seat's rise.\n  - The docked panel draws no FootFade on main. Confirm on the hub's machine which surface 7.png is.\n  - The probes edge-fade-end, caw-thread-run, ios-caw-thread and ios-thread-carry were cut in 420ca03c9.\n\nDefinition: a **session** is one harness process's conversation on one machine, with a lifetime. A **thread** is the person's conversation with the project's Caw, kept by the hub, outliving every session, machine and model move. A thread is a target; a session is its reader. A reader per thread is tsk-144, on top of this task; this task leaves the reader count where it is.\n\nDesign (cutover, one path):\n- **A thread is addressed as a session.** `thread:<id>` is the address a send goes to, a transcript page is read at (`GET /api/instances/thread:<id>/transcript`) and a stream is followed under. The composer mints a new thread's id as it mints a send's, and the first send carries `projectId`.\n- **One table for the person's words.**\n  - A thread send is a `sent_messages` row with `thread_id` (new), `instance_id` nullable (the lead it was handed to) and `read_at` (new), stamped by `readSend`.\n  - The wake to Caw goes out under the same uuid. `yourWords`' framing is added at hand-off, never written into the record.\n  - A wake that does not go out fails the record with the hub's sentence; Try again resends with `replaces`.\n  - `thread_messages` keeps Caw's replies, events and the person's answers to his questions. Its plain `you` rows are migrated into `sent_messages` once, at boot, recorded in `data_migrations`, and deleted.\n- **The hub builds the thread's page** (`thread-transcript.ts`):\n  - `you` blocks come from the records at `read_at`, with pending ones in `queued`; `caw`/`event` blocks come from thread_messages at `created_at`; the tail is Caw's live words.\n  - It sequences `TranscriptEvent`s under `thread:<id>`.\n- **The dashboard and the app show a thread through the real session state**:\n  - `cawco.session(\"thread:<id>\")`, with the real row builder, outbox, retry, edit, withdraw, RowFault and send-recovery.\n  - ThreadPane keeps only what is Caw's: the hero, his seat, task cards, folder files and his asks.\n  - The app's ThreadViewController reads `hub.sessions.transcripts[viewId]`.\n- **Push and search.**\n  - `said()` for a Caw reply calls `push.threadReply`: one collapse id per thread, a tap opens the thread, and no push if the thread was looked at since.\n  - `threadWords` reads Caw's thread_messages rows plus `sent_messages` with `thread_id`.\n- **The fade.** `FootFade` publishes `--fade-foot`, and Transcript's foot room is `max(composer clearance, --fade-foot)`. The docked panel draws the same FootFade.\n- **Deleted:**\n  - thread-blocks.ts;\n  - ThreadPane's stand-in `session`, `liveWords`, `readThread`/`sayInThread`/`startThread`/`wakeThread` and `state.threadMessages`;\n  - the `thread.message` frame;\n  - `ThreadSummary.hearing`/`ThreadHearing`, `ThreadRead`, `ThreadSaid`, `CawNotWoken` and the `not-woken` event kind;\n  - the routes `POST /threads`, `POST /threads/:id/messages`, `POST /threads/:id/wake` and `GET /threads/:id`;\n  - caw.ts `start`/`say`/`once`/`personSent`/`wakeAgain`;\n  - `thread:new:<project>` addressing;\n  - the app's `ThreadNote.block(in:)`, `ThreadsStore.transcript/hear/draw/say/wake` and the `!ThreadTabs.isThread` guards in Sessions.swift.\n  Nothing stays behind a fallback.",
  criteria: [
    {
      text: "`git grep -l threadBlockOf; git grep -l '\"thread.message\"'; git grep -l 'threads/:threadId/messages'; test -e apps/dashboard/src/lib/cawco/thread-blocks.ts` all find nothing; ThreadPane holds no `$state<SessionState>` and reads `cawco.session(viewId)`",
      met: null,
      score: null,
    },
    {
      text: "`sent_messages` has `thread_id`, `read_at` and nullable `instance_id`; `bun run --cwd packages/hub migrations:check` passes; after one boot on a database with thread history, `SELECT count(*) FROM thread_messages WHERE author='you' AND question IS NULL` is 0 and every former row is a `sent_messages` row with its `thread_id`, `state='read'` and `read_at`",
      met: null,
      score: null,
    },
    {
      text: "a thread send and its wake to Caw share one uuid: the `sent_messages` row goes `pending` → `read` with `instance_id` the lead's, and the same uuid is the user message in his transcript",
      met: null,
      score: null,
    },
    {
      text: "the person's scenario, live on web (the docked panel, the floating panel and the thread tab) and on iOS: send a message, send a second while Caw is thinking, scroll to the bottom. The second is its own row saying \"queued\" at the list's end while his turn runs, moves to read when his next turn takes it, and his reply to it lands after it. A reload and a second device show the same order. The last row scrolls clear of the bottom fade at 1440 and 390",
      met: null,
      score: null,
    },
    {
      text: "a send Caw cannot take is a failed row in the thread with the hub's sentence and Try again; Try again resends under `replaces`, and the thread holds no not-woken event",
      met: null,
      score: null,
    },
    {
      text: "a Caw reply pushes once per thread and not when the thread was looked at since; `find` returns a thread send written after the cutover",
      met: null,
      score: null,
    },
    {
      text: "`bun run check`, `bun run --cwd packages/hub openapi:check`, `bun packages/hub/scripts/wire-compat.ts` and `bash apps/apple/scripts/build-both.sh ios --compile-only` pass",
      met: null,
      score: null,
    },
  ],
  todos: [
    {
      id: "td-1",
      text: "Core types: SendRecord threadId/readAt/nullable instanceId, SendPayload.projectId, drop thread hearing/read/said/not-woken/frame",
      done: false,
      offered: true,
    },
    {
      id: "td-2",
      text: "Hub schema + drizzle 0326 + data migration of you rows",
      done: false,
      offered: true,
    },
    {
      id: "td-3",
      text: "Hub thread-transcript.ts page builder + stream events",
      done: false,
      offered: true,
    },
    {
      id: "td-4",
      text: "Hub deliverSend thread target, caw.ts sent(), delete routes/start/say/once/personSent/wakeAgain",
      done: false,
      offered: true,
    },
    {
      id: "td-5",
      text: "Push threadReply + find threadWords union",
      done: false,
      offered: true,
    },
    {
      id: "td-6",
      text: "Dashboard: delete thread-blocks/thread state, ThreadPane on cawco.session(viewId), thread id minting",
      done: false,
      offered: true,
    },
    {
      id: "td-7",
      text: "Fade: FootFade publishes --fade-foot, Transcript foot room max, docked panel FootFade",
      done: false,
      offered: true,
    },
    {
      id: "td-8",
      text: "iOS: Threads.swift / ThreadViewController on sessions store",
      done: false,
      offered: true,
    },
    {
      id: "td-9",
      text: "Checks: bun run check, openapi:check, migrations:check, wire-compat",
      done: false,
      offered: true,
    },
    {
      id: "td-10",
      text: "Artifact, task_result, commit, finish_item",
      done: false,
      offered: true,
    },
  ],
  type: null,
  labels: ["caw", "threads", "bug", "owner-ask"],
  fields: {},
  filedBy: "Caw",
  createdAt: 1_793_005_769_000,
  attempts: [
    {
      id: "fd8fbee7",
      session: {
        id: "504317bd-9cd8-4b9e-860b-048703ef0e0e",
        title:
          "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
        state: "working",
      },
      startedAt: 1_793_028_174_040,
      endedAt: null,
      state: "running",
      endedHow: null,
      headline: null,
    },
    {
      id: "5b80ecec",
      session: {
        id: "8d256c29-55cd-469b-9a71-a7b1479c52ef",
        title:
          "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
        state: "ended",
      },
      startedAt: 1_793_010_080_144,
      endedAt: 1_793_014_671_631,
      state: "done",
      endedHow: null,
      headline:
        "A Caw thread is now a session target: your thread messages are send records under the same uuid as Caw's wake. The hub serves the thread as a transcript, so web and iOS draw it with the real session rows (queued, failed with Try again, edit, withdraw). It's rebased onto origin/main with both conflicts resolved, and bun run check (tsc, migrations:check, openapi:check) and wire-compat pass. The iOS build hasn't run here.",
    },
  ],
  result: null,
  ask: null,
  waits: [],
  unblocks: [],
  history: [
    {
      at: 1_793_005_769_000,
      actor: "Caw",
      what: "create “Draw Caw's thread with the session transcript's rows, so queued messages sit where they were sent” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_005_770_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-agent",
      stage: null,
    },
    {
      at: 1_793_005_773_000,
      actor: "Caw",
      what: "update triage",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_007_764_000,
      actor: "Caw",
      what: "update description, acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_007_790_000,
      actor: "Caw",
      what: "update acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_007_998_000,
      actor: "Caw",
      what: "comment “The trace he asked for (\"trace why caw's chats are using di…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_008_231_000,
      actor: "Caw",
      what: "update title, description, acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_010_071_000,
      actor: "Caw",
      what: "update title, description, acceptance criteria, checks, context",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_010_080_000,
      actor: "hub",
      what: "stage ready → working",
      reason: "attempt 5b80ecec started",
      stage: {
        from: "ready",
        to: "working",
      },
    },
    {
      at: 1_793_014_671_000,
      actor: "hub",
      what: "add td-1, td-2, td-3, td-4, td-5, td-6, td-7, td-8, td-9, td-10",
      reason: "attempt 5b80ecec ended done with these left open in its plan",
      stage: null,
    },
    {
      at: 1_793_014_672_000,
      actor: "hub",
      what: "comment “Jev judged the acceptance criteria against the report of it…”",
      reason: "attempt 5b80ecec judged",
      stage: null,
    },
    {
      at: 1_793_014_672_000,
      actor: "hub",
      what: "stage working → review",
      reason: "attempt 5b80ecec done; its acceptance criteria wait for you",
      stage: {
        from: "working",
        to: "review",
      },
    },
    {
      at: 1_793_028_165_000,
      actor: "you",
      what: "comment “too many words, did this get implemented according to our d…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_028_165_000,
      actor: "you",
      what: "stage review → working",
      reason: null,
      stage: {
        from: "review",
        to: "working",
      },
    },
  ],
  comments: [
    {
      at: 1_793_007_998_438,
      author: "Caw",
      text: "The trace he asked for (\"trace why caw's chats are using different components to begin with, is this intentional or slop?\"), read from git on origin/main:\n\n- **Intentional, from the start.** c23399e8d (7 Oct, \"Caw threads in the rail and as session tabs\") drew a thread \"on the transcript's own components\": Transcript, Who, SystemLine, Prompt and the session Composer. Because a Caw thread isn't a session, it shaped the thread's messages into a SessionState (`blockOf`, then `session.blocks = messages.map(blockOf)`) so the real Transcript would draw it.\n- **Why not a real session:** Caw's lead session serves every thread of the project, so its transcript would mix threads. The thread is a projection of the hub's thread messages.\n- **Moved, not changed.** c0e1fac5b (16 Oct, the dock) moved that mapping into thread-blocks.ts, \"one function ... for the tab and the dock\".\n- **The unfinished part, and the cause:** only the drawing was reused, not a send's lifecycle. thread-blocks.ts maps a thread message straight to a plain user block with no queued/sent/read state. Neither it nor ThreadPane mentions queued, pending, outbox or send state. A message sent while Caw works is just the next \"you\" row, so it runs together with the previous one and never shows as waiting for Caw.\n- **The fade fix never reached the thread.** 518fcbe10 (25 Oct) fixed the edge fade for the board only, and Caw's panel never got it.\n\nSo for the build: keep the projection; a thread can't be a session. Give a thread message a send record with the same lifecycle (sending → queued while Caw's turn runs → read when his turn takes it → answered), drawn by the same queued-send rows a session uses, ordered by when Caw read it. Then apply --fade-foot to the panel.",
    },
    {
      at: 1_793_014_672_844,
      author: "hub",
      text: "Jev judged the acceptance criteria against the report of its attempt [Make a Caw thread a target of the session send pipeline, served by the hub as a transcript](cawco:session/8d256c29-55cd-469b-9a71-a7b1479c52ef). Not shown met:\n\n- `sent_messages` has `thread_id`, `read_at` and nullable `instance_id`; `bun run --cwd packages/hub migrations:check` passes; after one boot on a database with thread history, `SELECT count(*) FROM thread_messages WHERE author='you' AND question IS NULL` is 0 and every former row is a `sent_messages` row with its `thread_id`, `state='read'` and `read_at` (0.39)\n- a thread send and its wake to Caw share one uuid: the `sent_messages` row goes `pending` → `read` with `instance_id` the lead's, and the same uuid is the user message in his transcript (0.76)\n- the person's scenario, live on web (the docked panel, the floating panel and the thread tab) and on iOS: send a message, send a second while Caw is thinking, scroll to the bottom. The second is its own row saying \"queued\" at the list's end while his turn runs, moves to read when his next turn takes it, and his reply to it lands after it. A reload and a second device show the same order. The last row scrolls clear of the bottom fade at 1440 and 390 (0.05)\n- a send Caw cannot take is a failed row in the thread with the hub's sentence and Try again; Try again resends under `replaces`, and the thread holds no not-woken event (0.66)\n- a Caw reply pushes once per thread and not when the thread was looked at since; `find` returns a thread send written after the cutover (0.64)\n- `bun run check`, `bun run --cwd packages/hub openapi:check`, `bun packages/hub/scripts/wire-compat.ts` and `bash apps/apple/scripts/build-both.sh ios --compile-only` pass (0.03)",
    },
    {
      at: 1_793_028_165_491,
      author: "you",
      text: "too many words, did this get implemented according to our discussion? i am unable to grok the evidence, and the mockup here is useless and too obvious and didn't need to be said, in all this brief i don't know what got done and what the details and implementation is, just walls of t ext",
    },
  ],
  ready: false,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};

/** tsk-239 done: its attempt landed 5e2518cb3; the person filed it with a long, unedited title. */
export const done: TaskRead = {
  id: "tsk-239",
  title:
    "the list of slash commands that are available in the composer before a session is started, vs after it started, is different, why are there multiple paths for this?",
  stage: "done",
  kind: "done",
  passOn: null,
  sendBack: null,
  description: "",
  criteria: [],
  todos: [],
  type: null,
  labels: [],
  fields: {
    triage: "needs-info",
  },
  filedBy: "you",
  createdAt: 1_793_865_204_000,
  attempts: [
    {
      id: "4d161358",
      session: {
        id: "9a4d141d-3109-431a-9db6-689ffca8499e",
        title:
          "the list of slash commands that are available in the composer before a session is started, vs after it started, is different, why are there multiple paths for this?",
        state: "ended",
      },
      startedAt: 1_793_865_501_823,
      endedAt: 1_793_868_348_995,
      state: "done",
      endedHow: null,
      headline:
        "The composer's slash-command menu now comes from one source, the harness in the folder, before and after a session starts. A probe on a real Claude Code fleet shows the same 153 commands both ways, and the full check passes.",
    },
  ],
  result: {
    at: 1_793_868_348_995,
    session: {
      id: "9a4d141d-3109-431a-9db6-689ffca8499e",
      title:
        "the list of slash commands that are available in the composer before a session is started, vs after it started, is different, why are there multiple paths for this?",
      state: "ended",
    },
    headline:
      "The composer's slash-command menu now comes from one source, the harness in the folder, before and after a session starts. A probe on a real Claude Code fleet shows the same 153 commands both ways, and the full check passes.",
    report:
      "Task: [tsk-239](cawco:task/70ac3d41-5a28-4a31-8e9e-3be2b03d1516/tsk-239). Commit fb76b154e.\n\n## Why there were two paths\n- **Before start**, the New Session form (`NewSessionForm.svelte`) had its own `loadFleetMenu`: `fetch(\"/api/fleet\")`, then `skills = snapshot.skills.map(row => row.name)` and `plugins = snapshot.config.plugins.map(row => row.id)`. That is the hub's fleet catalog. It had no built-ins (/clear, /compact, /effort…), no project or user commands, no project skills and no plugin commands. It listed plugin ids (`/foo@market`), which are not commands.\n- **After start**, the composer reads `cawco.commandsOf(id)`. That comes from the session's `system.init` and its `supportedCommands` control (`refreshCommands` in client.svelte.ts), which is Claude Code's own list.\n\n## The change (one source, the second path deleted)\n- **core**: new machine control `CONTROL_FOLDER_COMMANDS` (\"folderCommands\"), args `[cwd, account?, model?]`, answers `SupportedCommands`.\n- **agent, Claude**: `folderCommands` in accounts.ts starts an idle `query()` that never takes a turn and returns `initializationResult().commands`. It runs in the folder and the account dir, launched by `folderLaunch` in claude.ts with what a session there would get: fleet and project Claude settings plus SESSION_SETTINGS, `sessionExtraArgs` (`--chrome`), and the model. Hooks are off (`disableAllHooks`) and it gets no MCP servers (`strictMcpConfig`). This matches what the session's `supportedCommands()` returns: in SDK 0.3.318 the code is `async supportedCommands(){let{commands:e}=await this.initialization;return this.latestCommands??e}`.\n- **agent, OpenCode**: the session's private `#slashCommands` moved to `opencodeSlashCommands(client, dir)` in opencode-client.ts. The session and the harness's `machine()` both use it.\n- **agent, pi**: `[]`, the same as its sessions.\n- **hub**: `GET /api/agents/:machineId/commands?harness&cwd&account&model`. The account is the one given, else `machineAccount`. Timeout is 30 s. openapi.json is regenerated.\n- **dashboard**: new `lib/cawco/slash-commands.ts` holds `CommandState`, `detailsOf`, `availableCommands` (moved out of client.svelte.ts), `answeredCommands` (now used by `refreshCommands`) and `folderCommands`. The form's `/` menu is an `$effect` that calls `folderCommands` for the first machine, harness, cwd, account and model once the folder is verified. `loadFleetMenu` and the plugin rows are deleted. Row kind: Skill, else the command's source, else \"Command\". The word `spawnWords.form.kinds.plugin` is replaced by `command`.\n\n## Where the lists still legitimately differ\n- An MCP server's prompts (`mcp__server__prompt`) join a session's list through `commands_changed` once its servers connect. The pre-start read starts none.\n- Claude Code names its skills only in a turn's `init` frame. So, before a first turn, both menus file a Claude skill under its source or \"Command\". After the first turn the composer files it as \"Skill\". The names are identical.\n\n## Proof\nProbe spec `scripts/probe-kit/specs/slash-commands-before-start.ts`. It runs a scratch fleet with a real hub, agent, sessiond and Claude Code 2.1.318 against the mock model, in a folder with a project skill and a project command:\n```\nPASS slash-commands-before-start: s1: before a session, the machine lists the folder's commands (153 listed; probe-folder-skill in, probe-folder-command in)\nPASS slash-commands-before-start: s2: the started session lists the same names (153 after, 153 before; only before: none; only after: none)\nPASS slash-commands-before-start: s3: each shared name reads the same in both (153 shared names read the same)\nALL PASS (1 specs, 55s)\n```\nThe first run failed on two real differences, and the fix is that the probe now launches with the session's flags and model:\n```\nFAIL s2: ... (153 after, 152 before; only before: none; only after: claude-in-chrome)\nFAIL s3: ... (differ: effort)\n```\n`claude-in-chrome` comes from `--chrome`, and `/effort`'s argument hint depends on the model.\n\n`bun run check --all` (after the claude-paths fix to the spec, which now uses `projectClaudeDir`):\n```\n── golar lint (2698 files) · 30.8s · ok\ncheck: 16 checks passed in 34.7s (50 more unchanged since their last pass)\n```\n`openapi:check` within it: \"openapi.json, OpenEnums.swift and the generator config are up to date\".\n\nNot run: the iOS build. Only the generated `apps/apple/.../openapi.json` changed (one new operation), no Swift.\n\nArtifact: [tsk-239-slash-commands](cawco:artifact/c34010a1-849b-400d-bd7f-56ef3e50eab2).",
    check: [
      "Agent: folderCommands in accounts.ts and folderLaunch in claude.ts launch the probe like a session (settings, --chrome, model) and turn hooks and MCP off",
      "Hub: the GET /api/agents/:machineId/commands route and its 30 s bound",
      "Dashboard: slash-commands.ts is shared by refreshCommands and the New Session form's effect",
      "The one legitimate gap: MCP prompts join after a session's servers connect, and Claude names its skills only in the init frame",
      "Probe spec: scripts/probe-kit/specs/slash-commands-before-start.ts",
    ],
    presented: {
      name: "tsk-239-slash-commands",
      href: "cawco:artifact/c34010a1-849b-400d-bd7f-56ef3e50eab2",
      picture: slashCommands,
    },
    commit: "5e2518cb3",
  },
  ask: null,
  waits: [],
  unblocks: [],
  history: [
    {
      at: 1_793_865_204_000,
      actor: "you",
      what: "create “the list of slash commands that are available in the composer before a session is started, vs after it started, is different, why are there multiple paths for this?” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_865_206_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it needs-info",
      stage: null,
    },
    {
      at: 1_793_865_502_000,
      actor: "hub",
      what: "stage ready → working",
      reason: "attempt 4d161358 started",
      stage: {
        from: "ready",
        to: "working",
      },
    },
    {
      at: 1_793_868_379_000,
      actor: "hub",
      what: "stage working → done",
      reason: "attempt 4d161358 done; landed 5e2518cb3",
      stage: {
        from: "working",
        to: "done",
      },
    },
  ],
  comments: [],
  ready: false,
  closeReason: "attempt 4d161358 done; landed 5e2518cb3",
  closedAt: 1_793_868_379_000,
  closedBy: "hub",
};

/** tsk-7 on 15 Oct at 08:50: both attempts stopped within seconds, and it sits in ready off the frontier. */
export const stopped: TaskRead = {
  id: "tsk-7",
  title: 'Find why hang-cards fails "panel-to-jump held at half the size"',
  stage: "ready",
  kind: "todo",
  passOn: null,
  sendBack: null,
  description:
    "Found 2026-10-13 by the probe-slot leaf (cda94bb6) running scripts/probe-ios-hang-cards.ts on cockpit-1cc58017's build (main at eaf72844, which has the push-tap fix): 237 PASS, 1 FAIL:\n\n\"FAIL iphone light: panel-to-jump held at half the size: … at time 0.000: w 390.0 (390.0 to 390.0) h 160.0 (63.0 to 160.0)\"\n\nThat build is the one going to TestFlight (iOS from main after eaf72844). Decide first whether the app regressed or the probe's expectation is stale:\n- run the probe on main's current build through the Mac slots (build-both.sh, then scripts/lib/mac-sim.ts / mac-slot.sh sim);\n- find the last commit where this check passed (git log on the Caw panel and Jump transition code, and on the probe; bisect with builds through the build slot if needed);\n- quote the line that sets the panel's height at time 0.\nIf it's the app, fix the transition so the panel morphs into Jump as the probe's spec says. If it's the probe, correct the expectation to the design that superseded it, citing the commit. Proof: the probe passes on main, all of iPhone and iPad.",
  criteria: [
    {
      text: "the cause is named with the commit that introduced it and the line that produces h 160 at time 0",
      met: null,
      score: null,
    },
    {
      text: "scripts/probe-ios-hang-cards.ts passes in full on main's build",
      met: null,
      score: null,
    },
    {
      text: "scripts/probe-ios-question-keyboard.ts runs once on main's build through the slots and passes: cda94bb6 moved its ConnectHardwareKeyboard=false write to after boot (a slot simulator arrives booted), and that probe hasn't run since; if the software keyboard doesn't show, fix the probe so it does",
      met: null,
      score: null,
    },
    {
      text: "iOS builds both targets",
      met: null,
      score: null,
    },
  ],
  todos: [],
  type: "high",
  labels: ["apple", "bug"],
  fields: {},
  filedBy:
    "we need to continue the work that is here claude/zealous-pascal-19onlg history e",
  createdAt: 1_791_888_380_000,
  attempts: [
    {
      id: "a86bb046",
      session: {
        id: "51a4e829-ade2-4004-aa36-93e7d507f2ed",
        title:
          'Find why hang-cards fails "panel-to-jump held at half the size"',
        state: "ended",
      },
      startedAt: 1_792_053_778_400,
      endedAt: 1_792_053_789_679,
      state: "cancelled",
      endedHow: "Stopped",
      headline: null,
    },
    {
      id: "8e26ff50",
      session: {
        id: "6c9c4aa0-6f63-47d3-a08b-7e591260bfae",
        title:
          'Find why hang-cards fails "panel-to-jump held at half the size"',
        state: "ended",
      },
      startedAt: 1_791_889_367_611,
      endedAt: 1_791_889_386_153,
      state: "cancelled",
      endedHow: "Stopped",
      headline: null,
    },
  ],
  result: null,
  ask: null,
  waits: [],
  unblocks: [],
  history: [
    {
      at: 1_791_888_380_000,
      actor:
        "we need to continue the work that is here claude/zealous-pascal-19onlg history e",
      what: 'task tsk-7: create “Find why hang-cards fails "panel-to-jump held at half the size"” in ready (by we need to continue the work that is here claude/zealous-pascal-19onlg history e)',
      reason: null,
      stage: null,
    },
    {
      at: 1_791_888_385_000,
      actor:
        "we need to continue the work that is here claude/zealous-pascal-19onlg history e",
      what: "task tsk-7: update acceptance criteria (by we need to continue the work that is here claude/zealous-pascal-19onlg history e)",
      reason: null,
      stage: null,
    },
    {
      at: 1_791_889_367_000,
      actor: "hub",
      what: "task tsk-7: stage ready → working (by hub: attempt 8e26ff50 started)",
      reason: null,
      stage: null,
    },
    {
      at: 1_791_889_386_000,
      actor: "hub",
      what: "task tsk-7: stage working → ready (by hub: attempt 8e26ff50 cancelled)",
      reason: null,
      stage: null,
    },
    {
      at: 1_792_053_778_000,
      actor: "hub",
      what: "task tsk-7: stage ready → working (by hub: attempt a86bb046 started)",
      reason: "attempt a86bb046 started",
      stage: {
        from: "ready",
        to: "working",
      },
    },
    {
      at: 1_792_053_789_000,
      actor: "hub",
      what: "task tsk-7: stage working → ready (by hub: attempt a86bb046 cancelled)",
      reason: "attempt a86bb046 cancelled",
      stage: {
        from: "working",
        to: "ready",
      },
    },
  ],
  comments: [],
  ready: false,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};

/** tsk-168 dropped on 31 Oct; the decision card it waited on was deleted with its page. */
export const dropped: TaskRead = {
  id: "tsk-168",
  title:
    "Give the hub a refusal for look cards whose options name no reference",
  stage: "dropped",
  kind: "dropped",
  passOn: null,
  sendBack: null,
  description:
    "This is waiting on his pick on [overnight-calls-1031](cawco:artifact/fb58def0-4bce-42e5-8d23-1279b2310bf8), card refs.\n\nIf he picks \"The hub refuses it\":\n- add a reference argument (a product and its screen) on `Option`;\n- add a refusal in the hub's decision-program check for any `look` card whose options don't each name one;\n- update the decision-page skill's SKILL.md and LIBRARY.md.",
  criteria: [],
  todos: [],
  type: null,
  labels: ["decision-pages"],
  fields: {
    triage: "ready-for-human",
  },
  filedBy: "Orchestrate CawCo after handover",
  createdAt: 1_793_424_693_000,
  attempts: [],
  result: null,
  ask: null,
  waits: [
    {
      kind: "card",
      label: "refs",
      href: "cawco:decision/fb58def0-4bce-42e5-8d23-1279b2310bf8/refs",
      state: "deleted",
      settled: false,
      flag: "was deleted with its page",
      value: null,
      via: null,
    },
  ],
  unblocks: [],
  history: [
    {
      at: 1_793_424_693_000,
      actor: "Orchestrate CawCo after handover",
      what: "create “Give the hub a refusal for look cards whose options name no reference” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_424_694_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-human",
      stage: null,
    },
    {
      at: 1_793_425_632_000,
      actor: "Run the ready CawCo tasks",
      what: "stage ready → dropped",
      reason:
        "He called it dumb (10-31): a typed string proves nothing. Reference-first lives in the designer briefs instead.",
      stage: {
        from: "ready",
        to: "dropped",
      },
    },
  ],
  comments: [],
  ready: false,
  closeReason:
    "He called it dumb (10-31): a typed string proves nothing. Reference-first lives in the designer briefs instead.",
  closedAt: 1_793_425_632_000,
  closedBy: "Run the ready CawCo tasks",
};

/** tsk-141 in ready since 26 Oct: every wait settled, no attempt yet, two agreed to-dos. */
export const ready: TaskRead = {
  id: "tsk-141",
  title:
    "Turn the person's rambles on a task into edits: a fast pass applies them, deeper asks go to research",
  stage: "ready",
  kind: "todo",
  passOn: null,
  sendBack: null,
  description:
    'The person, in thread 253e9989 (2026-10-26):\n- He asked whether Caw is notified when he comments, and acts on it. For example, he added a to-do as a suggestion: does it fold into the task\'s spec?\n- He wants to ramble in a comment or somewhere else and have the agent fix the tasks. Simple formatting or field filling goes to Sonnet; anything else goes to Opus for research. He asked for the best approach.\n- Popular software is not a reference, because it overtakes search results. He asked how Hilos, Relevance AI, Intent and similar small products do it (and: Mobbin is available for visual references).\n\nToday the person\'s comment on a task, a to-do he adds, or a stage he moves wakes nobody. Open to-dos reach the agent of the task\'s next attempt in its brief, but nothing folds them into the spec before then, and nobody answers a comment.\n\nHow the small, inventive products do it (their own docs, read 2026-10-26):\n- **Hilos** (hilos.sh/changelog, /docs/agents-101, /docs/automations):\n  - Talking is enough: "Describe real work and Hilo drafts a plan card"; "Call an agent by name ... no @ needed".\n  - The plan card has up to eight rows: "Nothing runs on the proposal. You approve each row on the card, and the rows you don\'t approve never dispatch." In plan mode, "replies revise it and Approve starts the build".\n  - The money gate: "An automation can ask — it can never spend": cheap actions happen, an agent run waits for a person.\n  - Model by kind of work: "hilos now classifies each hosted task — planning, coding, writing, quick calls — and picks a model to match", with "A posture slider ... Thrifty, Balanced, or Best" and "a step-by-step grid shows what each kind of work resolves to, and lets you override any row". "Every routed call is recorded".\n  - "Every Hilo behavior has its own switch ... and everything it does lands in an actions log."\n- **Intent / Augment** (augmentcode.com/blog/what-spec-driven-development-gets-wrong, /solutions/ticket-to-pr):\n  - "The spec isn\'t a human artifact or an agent artifact. Both sides read from it and write to it."\n  - Agents write back only the decisions that change direction ("Found an existing theme context provider ... Wired into that instead"), not narration.\n  - The person "Reads the plan on the ticket and approves or redirects it in one comment."\n  - From notes: "update the existing ticket ... Do not create a duplicate."\n- **Relevance AI** (relevanceai.com/docs/.../task-overview, /docs/sdk/tasks): each task has "a comment box at the bottom to message the Task directly"; a task that "Requires approval or has escalated" is in the status `action`, and the To Review tab collects them.\n\nWanted:\n1. **Anything the person writes about a task is input:** a comment or to-do on the task, or a thread message that names it. No @ needed (Hilos). It is batched (about 10 s quiet) and read as one ramble.\n2. **The spec is living, both sides write it (Intent).** One cheap structured pass turns the ramble into a typed patch: title, description sections, acceptance, to-dos added, ticked or reworded, labels, fields, relations, stage. It follows the project\'s conventions.\n3. **The model is chosen by kind of work (Hilos):** formatting and field filling → the cheap tier; research, design, code reading → the deep tier. The project setting is a posture (Thrifty / Balanced / Best) with a per-kind grid he can override, and every routed call is recorded with what it cost.\n4. **Money gate (Hilos):**\n   - Edits that cost one cheap call apply at once and show under his comment as the changes made, with one Undo.\n   - Anything that would start an agent run (research, a build) comes back as a plan card in the task\'s activity: one row per job with its kind, its model and a one-line brief. He approves rows one by one; unapproved rows never run. A reply on the card revises it.\n   - Stage moves, merges and archiving also come as card rows.\n5. **What comes back:** a run writes back into the spec only what changes direction (Intent), shown as a change with Undo, not narration. A question in his comment is answered under it. A task waiting on his card is in a "needs you" state, collected like Relevance\'s To Review.\n6. **Live attempts:** while an attempt is live, the comment also reaches that attempt\'s session.\n7. **No loops:** comments by agents, by Caw and by the pass itself wake nothing. Each behaviour has its own switch, and everything the pass does lands in the task\'s activity.\n\nDesign: references are these small products and Mobbin screens of small or new apps, never Jira, Linear, Plane or other big trackers. A preview goes to the person for a pick before the build.',
  criteria: [
    {
      text: "a comment or to-do the person adds to a task is read within about 15 s of his last keystroke, no @ needed",
      met: null,
      score: null,
    },
    {
      text: "edits are applied as a typed patch, shown under his comment change by change with one Undo, with no new session",
      met: null,
      score: null,
    },
    {
      text: "the model for each kind of work comes from a project posture (Thrifty / Balanced / Best) with a per-kind override, and each routed call is recorded with its cost",
      met: null,
      score: null,
    },
    {
      text: "anything that would start an agent run, move a stage, merge or archive comes as a plan card; only approved rows run, and a reply revises the card",
      met: null,
      score: null,
    },
    {
      text: "a run writes back only direction-changing decisions into the spec, with Undo; a question is answered under its comment",
      met: null,
      score: null,
    },
    {
      text: "agents', Caw's and the pass's own comments wake nothing; each behaviour has its own switch",
      met: null,
      score: null,
    },
    {
      text: "typecheck and lint pass; a probe-kit spec covers a formatting ramble, a field ramble, a stage-move ramble (card) and a research ramble (card, then run)",
      met: null,
      score: null,
    },
  ],
  todos: [
    {
      id: "td-1",
      text: "Mobbin: Devin https://mobbin.com/screens/18d1bd78-44e9-45b6-bd04-ac48dbf7244a · Emergent https://mobbin.com/screens/8d07af92-309e-4e22-bf02-a872508708a5 · Cofounder https://mobbin.com/screens/52d55c74-ed5e-4f4f-adbf-40715cb4bb66 · Ferndesk https://mobbin.com/screens/5eb452b6-b4f1-4594-ad7e-9a9ca9abd734",
      done: false,
      offered: false,
    },
    {
      id: "td-2",
      text: "Mobbin: Langdock https://mobbin.com/screens/879416cc-ee0b-42c9-999b-3f829c041b12 · Graphite https://mobbin.com/screens/88f81a55-bfa9-450c-b106-2ffd76e94f6a · WRITER https://mobbin.com/screens/65eaa501-c59e-47e8-8feb-82715829ec9e",
      done: false,
      offered: false,
    },
  ],
  type: null,
  labels: ["caw", "tasks", "owner-ask"],
  fields: {},
  filedBy: "Caw",
  createdAt: 1_793_002_794_000,
  attempts: [],
  result: null,
  ask: null,
  waits: [],
  unblocks: [],
  history: [
    {
      at: 1_793_002_794_000,
      actor: "Caw",
      what: "create “Wake Caw when the person comments on, adds a to-do to, or moves a task in his project” in ready",
      reason: null,
      stage: {
        from: null,
        to: "ready",
      },
    },
    {
      at: 1_793_002_795_000,
      actor: "hub",
      what: "update triage",
      reason: "Jev triaged it ready-for-agent",
      stage: null,
    },
    {
      at: 1_793_005_093_000,
      actor: "Caw",
      what: "update title, description, acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_005_103_000,
      actor: "Caw",
      what: "update triage",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_005_529_000,
      actor: "Caw",
      what: "update description, acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_005_729_000,
      actor: "Caw",
      what: "update description, acceptance criteria",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_005_815_000,
      actor: "Caw",
      what: "update context",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_005_833_000,
      actor: "Caw",
      what: "add td-1, td-2",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_008_355_000,
      actor: "Caw",
      what: "comment “From the task-surface review (assets/1bd57872/task-ux-revie…”",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_526_669_000,
      actor: "Continue CawCo open tasks",
      what: "Update tasks/tsk-141-wake-caw-when-the-person-comments-on-adds-a-to.md",
      reason: null,
      stage: null,
    },
    {
      at: 1_793_526_669_000,
      actor: "hub",
      what: "comments written by Continue CawCo open tasks put back",
      reason: "comments are added only as task comments",
      stage: null,
    },
    {
      at: 1_793_867_968_000,
      actor: "Continue CawCo open tasks",
      what: "comment “2026-11-05: the wake path is being built now, without new U…”",
      reason: null,
      stage: null,
    },
  ],
  comments: [
    {
      at: 1_793_867_700_242,
      author: "Continue CawCo open tasks",
      text: '2026-11-05: the wake path is being built now, without new UI, in cockpit-0574346f#04564f8a. It covers items 1, 6 and 7:\n- his comments, the tasks he adds and the to-dos he adds reach the project\'s conversation, batched over about 10 s;\n- a live attempt still gets the comment;\n- comments by agents, Caw or the hub wake nobody.\n\nHis words today: "when i add a comment to a task, caw was being triggred to reply to it but that has gone away at some point". Earlier, on tsk-239: "why didn\'t caw enhance it or get triggered on it?".\n\nStill here, waiting behind the design graph hold (tsk-18): the typed patch with Undo under his comment, the plan cards, and the Thrifty/Balanced/Best posture grid.',
    },
  ],
  ready: true,
  closeReason: null,
  closedAt: null,
  closedBy: null,
};
