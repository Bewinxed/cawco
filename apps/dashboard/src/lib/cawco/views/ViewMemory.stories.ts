/**
 * The Memory view's states (Component Story Format 3, live components): the
 * real ViewMemory and MemoryFile, each state drawn from a fixture project
 * folder run through the hub's own parsers (scripts/memory-fixtures.ts:
 * memory-view.ts `memoryPage`, `memoryFile`, core `presentPermission`), so
 * every frame is the component with the hub's data shapes, never a mock
 * layout. Each state at a phone's 390 and a desk's 1440; the file card at
 * its place beside the view (40% of a desk) and as its own page on a phone.
 */

import { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
import conflict from "#lib/cawco/memory/fixtures/conflict.json";
import desk from "#lib/cawco/memory/fixtures/desk.json";
import empty from "#lib/cawco/memory/fixtures/empty.json";
import failed from "#lib/cawco/memory/fixtures/failed.json";
import inbox_only from "#lib/cawco/memory/fixtures/inbox-only.json";
import many_files from "#lib/cawco/memory/fixtures/many-files.json";
import running from "#lib/cawco/memory/fixtures/running.json";
import unreachable from "#lib/cawco/memory/fixtures/unreachable.json";
import unreadable from "#lib/cawco/memory/fixtures/unreadable.json";
import MemoryFile from "#lib/cawco/memory/MemoryFile.svelte";
import {
  FixtureMemory,
  type MemoryFixture,
} from "#lib/cawco/memory/memory-fixture.js";
import Card from "#lib/components/ui/card/card.svelte";
import ViewMemory from "./ViewMemory.svelte";

const source = (fixture: unknown) =>
  new FixtureMemory(fixture as MemoryFixture);
const blocks = () =>
  new ProjectBlocks(
    () => "fixture-cockpit",
    () => []
  );
const noop = () => undefined;

/** The card's place beside the view on a desk: the split's side, 40% of a 1440 window's page. */
const side = () => ({
  Component: Card,
  props: {
    class: "relative flex overflow-hidden p-0",
    style: "inline-size: 485px; block-size: 860px",
  },
});

export default {
  title: "Projects/Memory",
  component: ViewMemory,
  args: {
    project: { id: "fixture-cockpit", name: "cockpit" },
    onopen: noop,
    onraw: noop,
    onhistory: noop,
    taskHref: (id: string) => `/project/fixture-cockpit?task=${id}`,
    viewItems: {},
  },
};

/** Notes in, facts sorted, briefs carrying them: Jev's sort waits under its note, deploy has a conflict and a line not read. 1440. */
export const Desk = {
  args: { source: source(desk), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** Notes in, facts sorted, briefs carrying them: Jev's sort waits under its note, deploy has a conflict and a line not read. 390. */
export const DeskPhone = {
  args: { source: source(desk), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** Nothing remembered yet: the one sentence each stage does, and the field that adds a note. 1440. */
export const Empty = {
  args: { source: source(empty), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** Nothing remembered yet: the one sentence each stage does, and the field that adds a note. 390. */
export const EmptyPhone = {
  args: { source: source(empty), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** A new project: notes in the inbox, Jev off, no facts yet, the curator not run. 1440. */
export const InboxOnly = {
  args: { source: source(inbox_only), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** A new project: notes in the inbox, Jev off, no facts yet, the curator not run. 390. */
export const InboxOnlyPhone = {
  args: { source: source(inbox_only), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** Thirty-one fact files, past the reshape's 25: Facts scrolls inside its block, Reshape is offered. 1440. */
export const ManyFiles = {
  args: { source: source(many_files), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** Thirty-one fact files, past the reshape's 25: Facts scrolls inside its block, Reshape is offered. 390. */
export const ManyFilesPhone = {
  args: { source: source(many_files), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** A conflict: deploy carries the needs-you mark and its count, first in Facts. 1440. */
export const Conflict = {
  args: { source: source(conflict), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** A conflict: deploy carries the needs-you mark and its count, first in Facts. 390. */
export const ConflictPhone = {
  args: { source: source(conflict), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** Curate now pressed: the run going under Inbox's head, a fold landed on deploy. 1440. */
export const Running = {
  args: { source: source(running), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** Curate now pressed: the run going under Inbox's head, a fold landed on deploy. 390. */
export const RunningPhone = {
  args: { source: source(running), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** The curator's run failed: the alert under Inbox's head says why, with Run again. 1440. */
export const Failed = {
  args: { source: source(failed), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** The curator's run failed: the alert under Inbox's head says why, with Run again. 390. */
export const FailedPhone = {
  args: { source: source(failed), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** A line that does not read: apple's row says so in the failure's hue. 1440. */
export const Unreadable = {
  args: { source: source(unreadable), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** A line that does not read: apple's row says so in the failure's hue. 390. */
export const UnreadablePhone = {
  args: { source: source(unreadable), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** The hub refused the read: what happened, why, and Retry. 1440. */
export const Unreachable = {
  args: { source: source(unreachable), blocks: blocks() },
  parameters: { viewport: 1440 },
};

/** The hub refused the read: what happened, why, and Retry. 390. */
export const UnreachablePhone = {
  args: { source: source(unreachable), blocks: blocks() },
  parameters: { viewport: 390 },
};

/** deploy open beside the view: its Conflict first, then Current with a ruling, Why lines and a 40-word fact, then Formerly folded. Beside the view, 1440. */
export const FileConflict = {
  component: MemoryFile,
  args: {
    source: source(conflict),
    path: "knowledge/deploy.md",
    onclose: noop,
    onraw: noop,
  },
  decorators: [side],
  parameters: { viewport: 1440 },
};

/** deploy open beside the view: its Conflict first, then Current with a ruling, Why lines and a 40-word fact, then Formerly folded. Its own page, 390. */
export const FileConflictPhone = {
  component: MemoryFile,
  args: {
    source: source(conflict),
    path: "knowledge/deploy.md",
    onclose: noop,
    onraw: noop,
    page: true,
    backLabel: "cockpit",
  },
  parameters: { viewport: 390 },
};

/** apple open: the line that does not read stands at its place with the hub's reason and Open raw. Beside the view, 1440. */
export const FileUnreadable = {
  component: MemoryFile,
  args: {
    source: source(desk),
    path: "knowledge/apple.md",
    onclose: noop,
    onraw: noop,
  },
  decorators: [side],
  parameters: { viewport: 1440 },
};

/** apple open: the line that does not read stands at its place with the hub's reason and Open raw. Its own page, 390. */
export const FileUnreadablePhone = {
  component: MemoryFile,
  args: {
    source: source(desk),
    path: "knowledge/apple.md",
    onclose: noop,
    onraw: noop,
    page: true,
    backLabel: "cockpit",
  },
  parameters: { viewport: 390 },
};

/** Your notes open: each with its day, its ⋯ withdrawing it, and the field that adds one. Beside the view, 1440. */
export const FileYourNotes = {
  component: MemoryFile,
  args: { source: source(desk), path: "AGENTS.md", onclose: noop, onraw: noop },
  decorators: [side],
  parameters: { viewport: 1440 },
};

/** Your notes open: each with its day, its ⋯ withdrawing it, and the field that adds one. Its own page, 390. */
export const FileYourNotesPhone = {
  component: MemoryFile,
  args: {
    source: source(desk),
    path: "AGENTS.md",
    onclose: noop,
    onraw: noop,
    page: true,
    backLabel: "cockpit",
  },
  parameters: { viewport: 390 },
};
