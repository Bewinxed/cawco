/**
 * The person's motion setting, as the kit says it to a page: every
 * renderer the page draws with, not only its own.
 *
 * Playwright's `page.emulateMedia({ reducedMotion })` reaches the page's
 * renderer and the frames that share it, and stops there. A frame of
 * another origin in a renderer of its own (an out-of-process frame: every
 * preview and canvas stage since each preview became an origin of its own,
 * Origin-Agent-Cluster) never hears it, so a reduced-motion check reading
 * that frame would read full motion and test nothing (ink spec 7 did). The
 * OS's setting reaches every renderer; this does too: `Emulation.
 * setEmulatedMedia` on each such frame's own DevTools session, now and on
 * every frame that commits a navigation later, until it is cleared.
 *
 * Each call then asks every frame of the page what it hears
 * (`matchMedia`), and throws, naming the frame, when one answers otherwise
 * than set: a check that would have tested nothing fails instead.
 *
 *   await emulateMotion(page, "reduce");        // every renderer, asserted
 *   await emulateMotion(page, "no-preference");
 *   await emulateMotion(page, null);            // cleared everywhere
 */
import type { CDPSession, Frame, Page } from "playwright-core";

export type Motion = "reduce" | "no-preference";

interface Saying {
  /** A frame committed a navigation: it hears the setting too. */
  committed: (frame: Frame) => void;
  motion: Motion;
  /** Each out-of-process frame's own session, which carries the setting. */
  sessions: Map<Frame, CDPSession>;
}

const saying = new WeakMap<Page, Saying>();

/** How long a frame may take to answer, ms, before the kit names it unanswered. Our call. */
const ANSWER_MS = 5000;

/** Whether the page is drawn by Chromium: only it has DevTools sessions per frame. */
const chromium = (page: Page) =>
  page.context().browser()?.browserType().name() === "chromium";

/**
 * Says `motion` to `frame` through its own session, when it is a renderer
 * of its own; a frame in its parent's renderer heard `page.emulateMedia`.
 * A navigation that changed its renderer gets a new session.
 */
async function sayTo(page: Page, state: Saying, frame: Frame): Promise<void> {
  if (frame === page.mainFrame() || frame.isDetached()) {
    return;
  }
  const old = state.sessions.get(frame);
  state.sessions.delete(frame);
  await old?.detach().catch(() => undefined);
  let session: CDPSession;
  try {
    session = await page.context().newCDPSession(frame);
  } catch {
    // "This frame does not have a separate CDP session": its parent's renderer.
    return;
  }
  state.sessions.set(frame, session);
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: state.motion }],
  });
}

/** What `frame` hears, asked once it can answer; null when it went away. */
async function heardIn(frame: Frame) {
  const deadline = Date.now() + ANSWER_MS;
  for (;;) {
    if (frame.isDetached()) {
      return null;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one ask at a time until the frame answers
      return await frame.evaluate(() => ({
        reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
        noPreference: matchMedia("(prefers-reduced-motion: no-preference)")
          .matches,
      }));
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(
          `the frame ${frame.url()} never answered what motion it hears: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
      await new Promise((done) => setTimeout(done, 100));
    }
  }
}

/**
 * Every frame of `page` hears `motion`: throws, naming each frame that
 * hears otherwise. Call again after a frame the check reads has loaded,
 * when it was not there at `emulateMotion`.
 */
export async function assertMotion(page: Page, motion: Motion): Promise<void> {
  const heard = await Promise.all(
    page.frames().map(async (frame) => ({ frame, heard: await heardIn(frame) }))
  );
  const wrong = heard
    .filter(
      ({ heard: one }) =>
        one &&
        (one.reduce !== (motion === "reduce") ||
          one.noPreference !== (motion === "no-preference"))
    )
    .map(
      ({ frame, heard: one }) =>
        `${frame.url() || "about:blank"} ${JSON.stringify(one)}`
    );
  if (wrong.length > 0) {
    throw new Error(
      `prefers-reduced-motion: ${motion} was set, but ${wrong.length} frame(s) hear otherwise: ${wrong.join("; ")}`
    );
  }
}

/**
 * The person's motion setting on `page` and every renderer it draws with,
 * asserted in each frame; `null` clears it everywhere (the browser's own).
 */
export async function emulateMotion(
  page: Page,
  motion: Motion | null
): Promise<void> {
  await page.emulateMedia({ reducedMotion: motion });
  const held = saying.get(page);
  if (motion === null) {
    if (held) {
      saying.delete(page);
      page.off("framenavigated", held.committed);
      await Promise.all(
        [...held.sessions.values()].map(async (session) => {
          await session
            .send("Emulation.setEmulatedMedia", { features: [] })
            .catch(() => undefined);
          await session.detach().catch(() => undefined);
        })
      );
    }
    return;
  }
  if (chromium(page)) {
    let state = held;
    if (state) {
      state.motion = motion;
    } else {
      const fresh: Saying = {
        motion,
        sessions: new Map(),
        committed: (frame) => {
          // A frame that commits later (attached, or swapped to another renderer) hears it too.
          sayTo(page, fresh, frame).catch(() => undefined);
        },
      };
      state = fresh;
      saying.set(page, fresh);
      page.on("framenavigated", fresh.committed);
    }
    const now = state;
    await Promise.all(page.frames().map((frame) => sayTo(page, now, frame)));
  }
  await assertMotion(page, motion);
}
