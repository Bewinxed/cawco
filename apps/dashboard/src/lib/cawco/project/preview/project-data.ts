/**
 * Cawco-Dev as the live hub answered on 2026-10-25 (GET /api/projects,
 * /api/projects/:id/tasks, /api/projects/:id/decisions, /api/instances),
 * for the project page's design fixtures (ProjectTopDesk, ProjectTopPhone,
 * MarkHues): its name and primary place, its views as the strip draws them
 * (Board, Table, Routines, Decisions with its four pages waiting on picks,
 * and Canvas, since one task hangs under another), no task waiting on you,
 * and the running sessions whose folders land on the first identity hue.
 */
import { IconChatAdd, IconSparkles } from "#lib/icons.js";
import type { BarView } from "../ViewBar.svelte";

export const PROJECT = {
  name: "Cawco-Dev",
  machine: "obelisk-of-light",
  os: "linux-x64",
} as const;

export const VIEWS: BarView[] = [
  { value: "board", label: "Board", draft: false, count: 0 },
  { value: "table", label: "Table", draft: false, count: 0 },
  { value: "routines", label: "Routines", draft: false, count: 0 },
  { value: "decisions", label: "Decisions", draft: false, count: 4 },
  { value: "canvas", label: "Canvas", draft: false, count: 0 },
];

/** The two Ask Caw glyphs on the table. */
export const ASK_GLYPHS = {
  "chat-add": IconChatAdd,
  sparkles: IconSparkles,
} as const;
export type AskGlyph = keyof typeof ASK_GLYPHS;

/** Running sessions of Cawco-Dev whose folder hashes to identity hue 1 (mark.ts `markHue`). */
export const ON_MARK_ONE = [
  {
    id: "68590407-03ac-4984-90c7-00456580af33",
    title: "Build project page decision page",
    place: "/home/bewinxed/.worktrees/cockpit-9a0cf419",
  },
  {
    id: "9baa534b-53a0-4e6f-b57c-55e399a43412",
    title: "Fix suggestions preview review findings",
    place: "/home/bewinxed/.worktrees/cockpit-c3136bad",
  },
  {
    id: "3dc9005d-cf52-4423-b749-21aea584c3c3",
    title: "Fix idle workspace judge close",
    place: "/home/bewinxed/.worktrees/cockpit-5c99da6d",
  },
] as const;
