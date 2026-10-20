/**
 * artifact-resize-loop's legs on a thread (ThreadPane): a project's Caw makes
 * a page artifact, and his thread shows it beside the conversation, as a
 * thread shows its lead's preview. In light and in dark:
 *
 * - Beside the thread at desk 1440, the viewport swept down to 400 and back:
 *   opening and the sweep post nothing to `/api/dashboard-errors` and log no
 *   ResizeObserver loop, and the head's More stood at some widths and at
 *   neither end.
 * - Beside the thread in a fine pointer's desk window 860 wide, opened from
 *   a link once the board lists it: the first frame painted with the
 *   split standing shows the preview's sheet, none shows it beside the
 *   conversation, and opening posts and logs no loop.
 *
 * The project's first thread is its Setup thread: Caw is woken with the
 * setup event, which names the thread and leaves the person's words in it
 * for him to read (setup.ts `openingOf`), so a marker there never reaches
 * the mock model. The thread is opened, Caw's answer in it waited for, and
 * the marker sent as the person's next message, which wakes him with its
 * words (caw.ts "You wrote in the thread").
 *
 * Caw starts in a bounded place of the project's, so this spec's fleet
 * starts a boundary, which no workspace can (README "A spec that delegates
 * runs on the host"): it runs on the host.
 *
 *   bun scripts/probe-kit/run.ts artifact-resize-loop-thread
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";
import {
  DESK_SWEEP,
  fleetUp,
  made,
  runLeg,
  runNarrow,
} from "./artifact-resize-loop";

const spec: Spec = {
  name: "artifact-resize-loop-thread",
  host: "a project's Caw starts in a bounded place, so its fleet starts a boundary",
  async run(kit) {
    const fleet = await fleetUp(kit);
    const src = join(fleet.sandbox, "thread-project");
    await mkdir(src, { recursive: true });
    await Bun.$`git init -q -b main && echo chips > README.md && git add -A && git -c user.email=p@p -c user.name=p commit -qm 'First commit'`
      .cwd(src)
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Chip wraps",
      machineId: MACHINE,
      cwd: src,
      caw: true,
    });
    const thread = (
      await fleet.api<{ thread: { id: string } }>(
        `/api/projects/${project.id}/threads`,
        { body: "Set it up as it comes." }
      )
    ).thread.id;
    await until(
      "Caw answered in the Setup thread",
      () =>
        fleet.query<{ n: number }>(
          "SELECT count(*) AS n FROM thread_messages WHERE thread_id = ? AND author = 'caw'",
          thread
        )[0]?.n ?? 0,
      (count) => count > 0,
      180_000
    );
    const id = await made(kit, "2", "chip-wraps-caw", () =>
      fleet.api(`/api/projects/${project.id}/threads/${thread}/messages`, {
        body: "PROBE-CALL:2",
      })
    );
    if (!id) {
      return;
    }
    // The thread's tab, and its row's link (links.ts `rowHref`).
    const pane = `thread:${thread}`;
    const path = `/session/${pane}`;
    const base = await fleet.dashboard();
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
      await runLeg(kit, base, {
        name: `desk ${theme}, beside its thread`,
        view: "desk",
        theme,
        path,
        ready: "[data-artifact-trigger]",
        steps: DESK_SWEEP,
        crosses: true,
      });
      await runNarrow(kit, base, {
        name: `narrow desk ${theme}, beside its thread`,
        pane,
        path,
        theme,
      });
    }
  },
};
export default spec;
