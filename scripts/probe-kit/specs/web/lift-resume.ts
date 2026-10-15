/**
 * Every outro that lifts its node as it leaves (motion/curves `lifting`) sets
 * it down when Svelte brings it back mid-leave: in the flow, pressable, its
 * inline style as it was. The next leave lifts it again.
 *
 * Found live on a Mac (keychain-unlock): a refusal answered
 * sooner than the form's fade brought the same form back (Svelte 5 resumes a
 * branch still leaving, branches.js `resume_effect`) with `crossOut`'s lift
 * still on it, out of the flow and `pointer-events: none`, so the retry's
 * press landed on the page behind. Every factory that wrote inline style
 * goes through `lifting` now; the bench (/motion/lift) runs each one's lift.
 *
 * Each case is asked for again twice: before Svelte's delay is over (0ms,
 * reset before any keyframes) and mid-fade (60ms of --dur-control). Read
 * back once every animation has landed: its computed position, pointer
 * events and grid area as at rest, its inline style as at rest, not inert,
 * and `elementFromPoint` at its button's centre is the button. Then it
 * leaves again and, 60ms in, stands lifted (Svelte called no factory: the
 * lift comes from `lifting`'s own `css`).
 *
 *   bun scripts/probe-kit/run.ts web lift-resume
 */
import type { Kit, Spec } from "../../kit";
import { open } from "../../kit";

interface Read {
  gridArea: string;
  hit: boolean;
  inert: boolean;
  inline: string;
  pointerEvents: string;
  position: string;
  zIndex: string;
}
interface Run {
  again: Read | null;
  back: Read | null;
  gone: Read | null;
  leaving: Read | null;
  rest: Read | null;
}

/** When each case is asked for again: before Svelte's delay is over, and mid-fade. */
const AFTER_MS = [0, 60] as const;

/** Lifted: its inline style moved off rest's, or (pageOut, on no pop) only made inert. */
const lifted = (read: Read | null, rest: Read) =>
  read !== null && (read.inline !== rest.inline || read.inert);

const spec: Spec = {
  name: "lift-resume",
  run: async (kit: Kit) => {
    const page = await kit.page("desk");
    await open(page, `${await kit.bench()}/motion/lift`, "[data-case]");
    const names = await page.evaluate(
      () =>
        (globalThis as unknown as { __lift: { names: string[] } }).__lift.names
    );
    for (const [i, name] of names.entries()) {
      for (const ms of AFTER_MS) {
        // biome-ignore lint/performance/noAwaitInLoops: one case at a time, each with the page to itself
        const run = await page.evaluate(
          ([at, wait]) =>
            (
              globalThis as unknown as {
                __lift: { run: (i: number, ms: number) => Promise<Run> };
              }
            ).__lift.run(at, wait),
          [i, ms] as const
        );
        const { rest, back } = run;
        kit.check(
          `${name}, asked for again ${ms}ms into its leave: lifted as it left, then set back down (position, pointer-events, grid area and inline style as at rest, not inert) and its button takes the press at its centre (elementFromPoint)`,
          rest !== null &&
            lifted(run.leaving, rest) &&
            back !== null &&
            back.position === rest.position &&
            back.pointerEvents === rest.pointerEvents &&
            back.gridArea === rest.gridArea &&
            back.zIndex === rest.zIndex &&
            back.inline === rest.inline &&
            !back.inert &&
            back.hit,
          JSON.stringify({ rest, leaving: run.leaving, back })
        );
        kit.check(
          `${name}, asked for again ${ms}ms in: its next leave lifts it again, and it goes`,
          rest !== null && lifted(run.again, rest) && run.gone === null,
          JSON.stringify({ again: run.again, gone: run.gone })
        );
      }
    }
  },
};

export default spec;
