/**
 * The status set: the Solar glyphs that say a state (DESIGN.md, Line 470,
 * The failure mark and the blocked mark), each the solid bold cut. Failed,
 * needs you, passed, working, sleeping, pause, blocked, unreachable, update
 * waits, update available, a run with nothing to say (minus), a machine
 * away, and the joined row's locked and heads-up marks.
 *
 * A status mark is never under 16px (DESIGN.md, Sizes): a Solar mark is 1.5
 * of 24 units, so at 12px it is 0.75px on a 1× screen and vanishes; 16px is
 * the smallest size that reaches one device pixel. vite.config.ts gives each
 * of these, wherever it is imported, `data-status-mark` and a 16px box in
 * place of unplugin-icons' 1.2em, so one set beside meta text (14.4px at
 * 1.2em) is 16px too; a component's own rule sizes it up from there, never
 * down. scripts/probe-kit/specs/status-marks.ts reads every one drawn.
 */
export const STATUS_MARKS: ReadonlySet<string> = new Set([
  "check-circle-bold",
  "clock-circle-bold",
  "cloud-cross-bold",
  "danger-circle-bold",
  "download-bold",
  "forbidden-circle-bold",
  "hand-shake-bold",
  "info-circle-bold",
  "lock-keyhole-minimalistic-bold",
  "minus-circle-bold",
  "moon-sleep-bold",
  "pause-circle-bold",
  "question-circle-bold",
  "refresh-circle-bold",
]);
