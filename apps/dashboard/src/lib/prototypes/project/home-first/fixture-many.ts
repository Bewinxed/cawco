/**
 * Cawco-Dev, this hub's own project, as task_read gave it on 2026-11-05: its
 * stages' real counts and the newest tasks of each, for the board at the
 * size a busy code project reaches. Titles, ids, labels and ages are its own.
 */
import type { Stage, Task } from "./model";

export const MANY_STAGES: Stage[] = [
  {
    id: "ready",
    name: "Ready",
    kind: "todo",
    count: 102,
  },
  {
    id: "working",
    name: "Working",
    kind: "active",
    count: 1,
  },
  {
    id: "review",
    name: "Review",
    kind: "you",
    count: 2,
  },
  {
    id: "done",
    name: "Done",
    kind: "done",
    count: 109,
  },
  {
    id: "dropped",
    name: "Dropped",
    kind: "dropped",
    count: 24,
  },
];

export const MANY_TASKS: Task[] = [
  {
    id: "tsk-240",
    title: "Show the new build's release notes in the update toast",
    stage: "ready",
    changed: "1 h ago",
    type: "design",
    labels: ["owner-ask", "design"],
    state: "stuck",
    cause:
      "waits on Replace the component canvas's grid of frames with the design graph",
  },
  {
    id: "tsk-237",
    title:
      "Cut a checkout place from the hub for a delegate on a machine without one",
    stage: "ready",
    changed: "13 h ago",
    labels: ["prd-5.1"],
  },
  {
    id: "tsk-236",
    title: "Research how to build a real Caw rig",
    stage: "ready",
    changed: "15 h ago",
    labels: ["needs-discussion", "owner-ask"],
  },
  {
    id: "tsk-234",
    title:
      "Add image provider settings to Configure: agy sign-in cell and default provider block",
    stage: "ready",
    changed: "23 h ago",
    type: "design",
    labels: ["owner-ask", "design"],
    state: "stuck",
    cause:
      "waits on Replace the component canvas's grid of frames with the design graph",
  },
  {
    id: "tsk-231",
    title:
      "Nudge a session to file its open items before its harness compacts it",
    stage: "ready",
    changed: "yesterday",
    labels: ["owner-ask", "compaction"],
  },
  {
    id: "tsk-230",
    title: "Time the design graph in iPhone Safari on the Mac",
    stage: "ready",
    changed: "yesterday",
    labels: ["design-graph", "performance"],
    state: "stuck",
    cause:
      "waits on Replace the component canvas's grid of frames with the design graph",
  },
  {
    id: "tsk-229",
    title: "Clear superseded design artifacts and held workspaces on his word",
    stage: "ready",
    changed: "yesterday",
    labels: ["needs-discussion", "cleanup"],
  },
  {
    id: "tsk-228",
    title: "Ask the owner five open questions",
    stage: "ready",
    changed: "yesterday",
    labels: ["needs-discussion", "owner-ask"],
  },
  {
    id: "tsk-227",
    title: "Raise four findings with the owner",
    stage: "ready",
    changed: "yesterday",
    labels: ["needs-discussion", "owner-ask"],
  },
  {
    id: "tsk-226",
    title: "Land the Liquid Glass title bars after his two picks",
    stage: "ready",
    changed: "19 h ago",
    labels: ["design", "owner-ask"],
    state: "stuck",
    cause: "waits on What names the artifact at the head of its panel?",
  },
  {
    id: "tsk-225",
    title:
      "Find why niftybot's session is refused after a move to the second Ultra",
    stage: "ready",
    changed: "yesterday",
    labels: ["bug", "accounts"],
  },
  {
    id: "tsk-224",
    title: "Cut previews over to one source of truth",
    stage: "ready",
    changed: "yesterday",
    labels: ["previews", "owner-ask"],
  },
  {
    id: "tsk-222",
    title: "Show the compaction choices in the iOS app's At the limit",
    stage: "ready",
    changed: "2 days ago",
    labels: ["ios", "app-hold"],
  },
  {
    id: "tsk-221",
    title: "Move a second repository from the phone",
    stage: "ready",
    changed: "2 days ago",
    labels: ["ios", "app-hold"],
  },
  {
    id: "tsk-135",
    title: "Relaunch at boot only what was working",
    stage: "working",
    changed: "4 days ago",
    labels: ["owner-ask", "bug"],
  },
  {
    id: "tsk-218",
    title: "Let start_session choose a harness",
    stage: "review",
    changed: "2 days ago",
    type: "medium",
    labels: ["bug", "fleet"],
  },
  {
    id: "tsk-142",
    title:
      "Make a Caw thread a target of the session send pipeline, served by the hub as a transcript",
    stage: "review",
    changed: "4 days ago",
    labels: ["caw", "threads"],
  },
  {
    id: "tsk-239",
    title:
      "the list of slash commands that are available in the composer before a session is started, vs after it started, is diff…",
    stage: "done",
    changed: "37 min ago",
  },
  {
    id: "tsk-238",
    title:
      "One shared mock reads a tool's answer even when Claude Code moves the call to the background",
    stage: "done",
    changed: "10 h ago",
    labels: ["probe-kit"],
  },
  {
    id: "tsk-233",
    title: "Give the tooltip's 2px rise a token",
    stage: "done",
    changed: "yesterday",
    type: "low",
    labels: ["design-tokens"],
  },
  {
    id: "tsk-232",
    title: "Delete the mocks scripts nothing runs",
    stage: "done",
    changed: "yesterday",
    type: "low",
    labels: ["cleanup"],
  },
  {
    id: "tsk-219",
    title: "Build the configurable compaction method",
    stage: "done",
    changed: "2 days ago",
    labels: ["compaction", "build"],
  },
  {
    id: "tsk-217",
    title: "Close a task when the fix for it lands",
    stage: "done",
    changed: "2 days ago",
    type: "high",
    labels: ["bug", "tasks"],
  },
  {
    id: "tsk-215",
    title: "Let a workspace remove a nested worktree it made",
    stage: "done",
    changed: "3 days ago",
    labels: ["bug", "workspaces"],
  },
  {
    id: "tsk-214",
    title: "Move hub refusal reasons into the words module",
    stage: "done",
    changed: "2 days ago",
    labels: ["words", "sweep"],
  },
  {
    id: "tsk-212",
    title: "Fix a preview's dev server serving a deleted import after a commit",
    stage: "done",
    changed: "3 days ago",
    labels: ["bug", "previews"],
  },
  {
    id: "tsk-209",
    title: "Keep a delegate's preview open after its session ends",
    stage: "done",
    changed: "2 days ago",
    type: "high",
    labels: ["defect"],
  },
  {
    id: "tsk-207",
    title: "Give no_reply_needed a true description on OpenCode",
    stage: "done",
    changed: "2 days ago",
    type: "medium",
    labels: ["defect"],
  },
  {
    id: "tsk-206",
    title: "Let the dashboard dev server start without a hub for dev routes",
    stage: "done",
    changed: "2 days ago",
    type: "medium",
    labels: ["defect"],
  },
  {
    id: "tsk-204",
    title:
      "Fix connect_ask reporting connected while the session gets no tools",
    stage: "done",
    changed: "2 days ago",
    type: "high",
    labels: ["defect"],
  },
  {
    id: "tsk-202",
    title:
      "Fix workspace create failing when the hub is slow to name the LFS store",
    stage: "done",
    changed: "2 days ago",
    type: "high",
    labels: ["defect"],
  },
  {
    id: "tsk-235",
    title:
      "Add image provider settings to Configure: agy sign-in cell and default provider block",
    stage: "dropped",
    changed: "23 h ago",
    type: "design",
    labels: ["owner-ask", "design"],
    state: "stuck",
    cause:
      "waits on Replace the component canvas's grid of frames with the design graph",
  },
  {
    id: "tsk-223",
    title: "Judge the product's at-limit summary against the benchmark's",
    stage: "dropped",
    changed: "2 days ago",
    labels: ["compaction", "needs-owner"],
  },
  {
    id: "tsk-197",
    title: "Pick how a phone names the section in view",
    stage: "dropped",
    changed: "5 days ago",
    labels: ["wayfinder:grilling"],
  },
  {
    id: "tsk-185",
    title: "Make the component canvas fast in iPhone Safari",
    stage: "dropped",
    changed: "2 days ago",
    labels: ["bug", "performance"],
  },
  {
    id: "tsk-170",
    title: "Give each design-graph preview serve its own build folder",
    stage: "dropped",
    changed: "5 days ago",
    labels: ["bug", "design-graph"],
  },
  {
    id: "tsk-168",
    title:
      "Give the hub a refusal for look cards whose options name no reference",
    stage: "dropped",
    changed: "5 days ago",
    labels: ["decision-pages"],
    state: "stuck",
    cause: "waits on refs",
  },
  {
    id: "tsk-167",
    title: "Live-check the open pick pages before he relies on them",
    stage: "dropped",
    changed: "5 days ago",
    labels: ["review", "decision-pages"],
  },
  {
    id: "tsk-163",
    title:
      "Show states of projects without stories by route (route-addressed stage)",
    stage: "dropped",
    changed: "6 days ago",
    labels: ["canvas/artifacts", "needs-discussion"],
    state: "stuck",
    cause:
      "waits on Replace the component canvas's grid of frames with the design graph",
  },
  {
    id: "tsk-144",
    title:
      "Give each Caw thread its own reader session, with the project folder as shared memory",
    stage: "dropped",
    changed: "7 days ago",
    labels: ["caw", "threads"],
  },
  {
    id: "tsk-120",
    title: "Hold UI builds whose decision page is still undecided",
    stage: "dropped",
    changed: "10 days ago",
    labels: ["bug", "retro"],
  },
  {
    id: "tsk-112",
    title: "Pick the project page's head (decision page ready)",
    stage: "dropped",
    changed: "10 days ago",
    labels: ["projects", "waiting-on-pick"],
    state: "stuck",
    cause:
      "waits on Settle one error-state and one placement rule for every surface",
  },
  {
    id: "tsk-100",
    title:
      "Show the built Decisions list and run the usefulness check he asked for",
    stage: "dropped",
    changed: "10 days ago",
    labels: ["owner-ask", "decision"],
  },
  {
    id: "tsk-99",
    title: "Show him the Offered to-dos group that shipped without a page",
    stage: "dropped",
    changed: "10 days ago",
    labels: ["owner-ask", "decision"],
  },
  {
    id: "tsk-98",
    title:
      "Restore comments reaching the agent on Send, or confirm his new pick",
    stage: "dropped",
    changed: "10 days ago",
    labels: ["owner-ask", "decision"],
  },
];
