// Accounts: several sign-ins per provider, and which one a session runs on.
export * from "./accounts";
// Connections: outside services the hub signs in to and calls for sessions.
export * from "./actions";
// "Continue in new session": the size rules the hub and the dashboard share.
export * from "./activity";
export * from "./archive";
export * from "./artifact-kinds";
// What waits on the person among the artifacts: Needs you's artifact items.
export * from "./artifact-needs";
export * from "./ask-tools";
// Files and texts a turn carries, and the line naming each attached file.
export * from "./attachments";
// Pages are blocks: a project page's arrangement, kept by the hub.
export * from "./blocks";
// A project's browser: its key, the agent's ports, the daemon's frame and the hub's commands.
export * from "./browser";
// An artifact's `state`: one entry per choice or field, and its bounds.
export * from "./choices";
// Claude Code's dir names, as a screen, a message or a shell script names them (paths.ts owns the paths).
export * from "./claude-dirs";
// A connect ask's answer, as its agent reads it and its record reads it back.
export * from "./connect-ask";
export * from "./connections";
export * from "./continuation";
export * from "./continuation-read";
// Who decides: a card's kinds, their routes and the words for them.
export * from "./decides";
// Delegate types: named presets the `delegate` tool's `type` param resolves,
// so routing is by description instead of a raw model string.
export * from "./delegate-types";
// A task's deliverables by kind, and a post task's `*.post.json`.
export * from "./deliverables";
// A checkout's JavaScript dependencies from its root lockfile: a workspace's
// cut and the repository's scripts, never the landing gate.
export * from "./deps";
// An external item on a task: a GitHub or Linear link and a comment carried from it.
export * from "./external-items";
// Finding things across the fleet: what /api/find answers (find.ts).
export * from "./find";
// Fleet MCP + skills desired state, sync reports, and the `/` menu (NEW.md §11).
export * from "./fleet";
// Fleet watch: its signals, limits, words and frames (Projects spec §5.3).
export * from "./fleet-watch";
export * from "./frames";
// The harness-neutral spine (2026-08 rework). CawCo owns these types; the
// harness adapters (claude, opencode, pi) translate their native events into
// them, the hub peeks them, the dashboard folds them. See harness.ts for the
// rules. The `SDK*` names are kept for one release so the dashboard's imports
// did not all have to move at once; they are neutral types, not the SDK's.
export * from "./harness";
// A project's Claude Code settings, OpenCode plugins and pi extensions, placed
// as its MCP servers are, and refused the same way at the hub and the machine.
export * from "./harness-config";
// Hooks the fleet keeps: the lifecycle event, the matcher, and the script the
// machines run. The matcher's three-way reading lives here so the editor's test
// box previews exactly what Claude Code will do with it, and `hookProblem` is
// shared so the hub and the form refuse the same drafts for the same reasons —
// this is the one row whose convergence executes code, so it is gated twice.
export * from "./hooks";
export * from "./hub-auth";
export * from "./injected";
// Adding a machine: one install, kept by the hub from its start to the
// person's act on its outcome (hub installs.ts), and its window's steps.
export * from "./install";
// The system's laws, named and checked in the running product: `invariant()`.
export * from "./invariant";
// Adding a machine: the join routes' shapes and the install script's step
// prefix, which `cawco binary-install agent` prints and the hub reads back off SSH output.
export * from "./join";
// The hub's `.local` name and the dashboard's address at it.
export * from "./local-name";
export * from "./machine-names";
// Moving a project to a machine without a checkout of it: the hub-owned job,
// its estimate and request, and the hub ↔ machine controls that run its steps.
export * from "./move";
// Where the owner is (presence) and which notifications are over (clears):
// the hub holds a session's notifications while a client has it in front.
export * from "./notifications";
// What a permission prompt says on every surface, stamped by the hub as it
// parks the ask: the summary, who asked, the change it makes, its fields.
export * from "./permission-presentation";
// A session's plan: its steps, its spec, its task's to-dos, and their live frames.
export * from "./plan";
export * from "./presence-onboarding";
// A project's conversation: its view, the hub's notes in it, its spend.
export * from "./project-conversation";
// A project's landing gate as its gate.md declares it: the hub reads it, Settings draws it.
export type {
  DeclaredStep,
  ProjectGate,
  RunsOnCapability,
} from "./project-gate";
// Which projects a session lists in: the rail and the hub's forget read one rule.
export * from "./project-membership";
// How an `AskUserQuestion` answer is shaped, wherever it is answered from —
// the dashboard, the app, a parent session's `answer_delegate`.
// Shared because the tool's schema is unforgiving: the answers go back inside
// the tool's own input or the call fails validation.
export * from "./question";
export * from "./references";
export * from "./relaunch";
export * from "./relays";
// The bounded replay ring behind the Ledger Protocol — SessionRing, lifted
// from packages/hub/src/stream.ts so sessiond's per-child ring (see
// sessiond.ts) can reuse the identical class.
export * from "./ring";
// Standing instructions the hub enforces on every session: a phrase to watch
// for and a reply to send back. The matcher lives here so the hub and the
// editor's test box decide identically.
export * from "./routine-kinds";
export * from "./rules";
export * from "./scratch-tag";
// What reads as a credential in text: a memory note's words, a file a place's first commit would take.
export * from "./secret-text";
// A project's starters: what its empty board and Caw's panel offer to say to him.
export * from "./starters";
// The Ledger Protocol: canonical session streams + acknowledged commands.
export * from "./stream";
// The fleet's stream relay: its ports, the daemon's frame, the hub's commands and the relay step's words.
export * from "./stream-relay";
// HTTPS on the hub machine's tailnet name: its state, and a preview's origin there.
export * from "./tailnet-https";
export * from "./task-history";
// A project's tasks and stages as the hub answers them and the dashboard reads them.
export * from "./task-views";
// The tool catalog and its status/policy shapes (NEW.md §10).
export * from "./tools";
// Where a project's tasks live (Projects spec D2): CawCo's files, GitHub Issues or Linear.
export * from "./trackers";
// Transcripts: the hub folds each session's frames into blocks once
// (TranscriptBuilder) and every client renders what it serves.
export {
  type HubLine,
  type LinePlaced,
  TRANSCRIPT_PAGE,
  TranscriptBuilder,
} from "./transcript";
export {
  COMPACT_SUMMARY_KIND,
  getToolGlance,
  interruptLine,
  personWords,
  sendRef,
  transcriptUserText,
} from "./transcript-rules";
export * from "./transcript-types";
// Usage, cost & limits (USAGE-SPEC.md §4). Pure types/math only.
export * from "./usage";
// A project's custom views: their files, and the view tools' inputs and
// outputs. The OpenUI library itself is `@cawco/core/views-library`.
export * from "./views";
export * from "./wait-targets";
export * from "./work-items";

// sessiond's protocol types are deliberately NOT re-exported here. That module
// reaches for `node:os` and `node:path` to derive its endpoint, and this barrel
// is imported by the dashboard — a browser bundle, where Vite externalises
// `node:*` and the first property access throws, taking the whole client module
// down with it. Import them from `@cawco/core/sessiond` instead; the subpath
// export exists for exactly that, as `./usage/opencode-go` already does.

export { CAWCO_ENV, type CawcoEnvVar, readEnv } from "./cawco-env";
export * from "./image-generation";
// The hub's own protocol: verbs, envelopes, payloads and rows.
export * from "./protocol";
// How a session with no given title names itself: its first user message,
// cleaned. Shared so the hub's derived title and the dashboard's transcript
// title are the same string, character for character.
export * from "./title";
// The words the dashboard and the native app share (Words.generated.swift).
export * from "./words/accounts";
export * from "./words/artifact-tools";
export * from "./words/artifacts";
export * from "./words/asks";
export * from "./words/blocks";
export * from "./words/browser";
export * from "./words/catalog";
export * from "./words/caw-head";
export * from "./words/comments";
export * from "./words/common";
export * from "./words/configure";
export * from "./words/connect";
export * from "./words/connection";
export * from "./words/connections";
export * from "./words/contact";
export * from "./words/containers";
export * from "./words/decisions";
export * from "./words/delegate-types";
export * from "./words/external-items";
export * from "./words/files";
export * from "./words/find-secrets";
export * from "./words/fleet-faults";
export * from "./words/gate";
export * from "./words/harness";
export * from "./words/helpers";
export * from "./words/leaks";
export * from "./words/lfs";
export * from "./words/machine";
export * from "./words/made";
export * from "./words/mcp";
export * from "./words/memory";
export * from "./words/notices";
export * from "./words/offers";
export * from "./words/pairing";
export * from "./words/place";
export * from "./words/plan";
export * from "./words/presence";
export * from "./words/presence-log";
export * from "./words/preview";
export * from "./words/project";
export * from "./words/project-conversation";
export * from "./words/project-settings";
export * from "./words/routines";
export * from "./words/rules";
export * from "./words/sheet";
export * from "./words/shell";
export * from "./words/side";
export * from "./words/sidebar";
export * from "./words/skills";
export * from "./words/spawn";
export * from "./words/spend";
export * from "./words/tailnet";
export * from "./words/task-links";
export * from "./words/task-review";
export * from "./words/transcript";
export * from "./words/updates";
export * from "./words/views";
export * from "./words/work";
export * from "./words/workspace-needs";
