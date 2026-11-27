/**
 * A design graph read by the daemon (design graph §2, C2): the machine's
 * own Chromium (capabilities.ts `browserExecutable`, the browser the person
 * installed; never an install of ours) opens the canvas page on the
 * workspace's stage as the stage's own page (`by=stage`, the canvas's
 * reader entry), which reads each section in turn and posts its render
 * report to the stage. It is the one page that reads: no page a person
 * uses reads or posts, so no read ever runs where a person types or
 * scrolls. The agent never needs a browser of its own, and a verifier
 * reads the same report.
 *
 * The page is kept: one per canvas in use ({@link KeptReader}), opened by
 * the first read of it and left open, so Vite's HMR reaches it and it reads
 * each save as it lands. A read asks it for the stage's report once that
 * holds a draw of the files as they stand (core `readerOwed`), asking it to
 * read a file again where a change reached the file and no module of its
 * page. "In use" is the stage's own word: a kept page closes when its
 * stage sleeps, stops or starts again ({@link closeReaders}, from the
 * stage's `kill`), and when no read has asked for it for the stage's idle
 * time ({@link idleReaders}, from the stage's watch). A page closed under a
 * read (its stage killed, its browser gone) fails that read, and the next
 * read opens another. The readers share one Chromium, launched as the first
 * opens and closed once none is open.
 *
 * A picture of a state, a picture of the stage in view or a measured move
 * is drawn on a page of its own in that browser, closed once it answers:
 * it stands the drawing at the state, grows the window, holds the page's
 * animations, which a kept reader's page must not.
 *
 * A read waits on its page while the page shows life ({@link pageLive}:
 * each request it finishes or fails, each load, each move of its sweep or
 * the stage's report), however large the canvas, and its page closing ends
 * it: a read of one state draws that state's section alone (core
 * `sweptFiles`). A read its asker lets go (the hub's abandon) or whose page
 * went quiet answers the stage's report with the sections it did not draw,
 * where it stood in each and the state read that draws each alone (core
 * `StageRendered`).
 *
 * A stage listens inside its boundary; the daemon reaches it through the
 * preview bridge's unix socket on Linux (`reachWorkspace`), which no browser
 * dials. So a loopback TCP listener pipes every connection to that socket,
 * Vite's HMR socket included, one per stage while a page of it is open
 * (probe run 3 measured this path). On macOS the stage's own loopback port
 * is the host's, and the browser dials it directly.
 */

import { type Bounded, Gone, readWhileLive } from "@cawco/core/bounded";
import { lookUntil } from "@cawco/core/effect/poll";
import {
  CANVAS_PATH,
  CANVAS_PLAN_ID,
  FORMS,
  MEASURE_PARAM,
  RENDER_STATE_PARAM,
  REPORT_PATH,
  type RenderAsk,
  type RenderReport,
  readerOwed,
  type SectionPlan,
  type SectionUndrawn,
  type StageRendered,
  screenHeight,
  sectionPlansOf,
} from "@cawco/core/stage";
import type { MeasureRead } from "@cawco/core/stage-measure";
import { ReportAnswerSchema } from "@cawco/core/stored-shapes";
import { measureWords } from "@cawco/core/words/stage-measure";
import { stageRenderWords as words } from "@cawco/core/words/stage-render";
import type { Socket, TCPSocketListener } from "bun";
import { Duration, Effect } from "effect";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { hearPage } from "./artifact-picture";
import { chromiumSandboxed } from "./capabilities";
import { launchChromium } from "./chromium";
import { runPromise } from "./daemon-runtime";
import {
  findState,
  poseState,
  statePicture,
  untilLetGo,
} from "./frame-picture";
import { layoutNow, readAgainNow, sweepNow, textNow } from "./in-page/page";
import { fromPromise } from "./rejected";
import { measureMove } from "./stage-measure";

/** How often the page's sweep is read while it draws. Ours. */
const POLL_MS = 250;
/** The quiet a page keeps after its last report before it is read. Ours: the canvas posts 200 ms after its last change. */
const SETTLE_MS = 600;
/**
 * How long a file the stage's report owes a read of must stand unread by
 * the kept page before the page is asked to read it again: past Vite's
 * watcher and its HMR message, so a save's own update reaches the page
 * first and the ask is for a change no module of the page took. Ours.
 */
const READ_AGAIN_MS = 1000;
/** The window a render opens in: the desk's. A state the stage can't hold whole at its own size grows it (frame-picture.ts `poseState`). */
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The browser a render of `width` opens as: a read of a phone's width
 * (under core {@link FORMS}' tablet, as the canvas's frames answer a
 * phone, canvas/width.ts) opens as that phone, its screen upright
 * (`screenHeight`, 390×844) and its touch emulated, so the window answers
 * the device features a page reads off it as the frame does; any other,
 * the desk's {@link VIEWPORT} with a mouse.
 */
const browserFor = (width: number | undefined) =>
  width !== undefined && width < FORMS.tablet
    ? { viewport: { width, height: screenHeight(width) }, touch: true }
    : { viewport: VIEWPORT, touch: false };

/** A render's answer (core `StageRendered`): `png` a PNG, base64, when asked. */
export type Rendered = StageRendered;

/** Bytes waiting for a socket to drain, per direction; and what came before its peer was connected. */
interface Pipe {
  early: Uint8Array[];
  peer: Socket<Pipe> | null;
  pending: Uint8Array[];
}

/** Writes what it can now and keeps the rest for the socket's drain. */
const send = (socket: Socket<Pipe>, bytes: Uint8Array): void => {
  if (socket.data.pending.length > 0) {
    socket.data.pending.push(bytes);
    return;
  }
  const wrote = socket.write(bytes);
  if (wrote < bytes.length) {
    socket.data.pending.push(bytes.subarray(Math.max(0, wrote)));
  }
};

const drain = (socket: Socket<Pipe>): void => {
  let [next] = socket.data.pending;
  while (next) {
    const wrote = socket.write(next);
    if (wrote < next.length) {
      socket.data.pending[0] = next.subarray(Math.max(0, wrote));
      return;
    }
    socket.data.pending.shift();
    [next] = socket.data.pending;
  }
};

/** A loopback listener that pipes each connection to the bridge's unix socket: a stage's while a page of it is open, or one picture's (stage.ts `drawServed`). */
export function listenerFor(unix: string): Promise<TCPSocketListener<Pipe>> {
  return Promise.resolve(
    Bun.listen<Pipe>({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        async open(client) {
          client.data = { early: [], pending: [], peer: null };
          try {
            const upstream = await Bun.connect<Pipe>({
              unix,
              data: { early: [], pending: [], peer: client },
              socket: {
                data: (_socket, bytes) => send(client, bytes),
                drain,
                close: () => {
                  client.end();
                },
                error: () => {
                  client.end();
                },
              },
            });
            client.data.peer = upstream;
            // The browser may speak before the bridge answers: nothing it said is lost.
            for (const bytes of client.data.early.splice(0)) {
              send(upstream, bytes);
            }
          } catch {
            client.end();
          }
        },
        data: (client, bytes) => {
          if (client.data.peer) {
            send(client.data.peer, bytes);
          } else {
            client.data.early.push(new Uint8Array(bytes));
          }
        },
        drain,
        close: (client) => {
          client.data.peer?.end();
        },
        error: (client) => {
          client.data.peer?.end();
        },
      },
    })
  );
}

/**
 * `work` for as long as `page` shows life (core bounded.ts
 * `readWhileLive`): each of its events artifact-picture.ts `hearPage`
 * hears (a request finished or failed, an answer, a navigation, a load),
 * and each `alive()` the work says of its own (its sweep or the stage's
 * report moving). Its page's close answers `unanswered` "dead"; `asker`
 * aborting (the hub let the read go) rejects with its reason, which the
 * read's caller answers as far as it got. `work` is handed the wait's own
 * signal, which aborts as the wait is let go.
 */
const pageLive = <T>(
  page: Page,
  asker: AbortSignal,
  work: (signal: AbortSignal, alive: () => void) => Promise<T>
): Promise<Bounded<T>> =>
  readWhileLive(
    (signal, alive) => {
      const unhear = hearPage(page, alive);
      const done = new AbortController();
      // The page's close, heard as the work waits: the work is Gone.
      const gone = runPromise(
        Effect.callback<never, Gone>((resume) => {
          const closed = (): void =>
            resume(Effect.fail(new Gone("the render's page closed")));
          page.once("close", closed);
          return Effect.sync(() => page.off("close", closed));
        }),
        { signal: done.signal }
      );
      gone.catch(() => undefined);
      return Promise.race([work(signal, alive), gone]).finally(() => {
        done.abort();
        unhear();
      });
    },
    { signal: asker }
  );

/** `work`'s outcome, or `null` once `asker` let it go: what was drawn by then is the read's answer. */
const unlessLetGo = <T>(asker: AbortSignal, work: Promise<T>) =>
  work.catch((error: unknown) => {
    if (asker.aborted) {
      return null;
    }
    throw error;
  });

/** The refusal a machine with no Chromium answers a read with. */
const NO_CHROMIUM =
  "This machine has no Chromium browser for the stage to draw with: install Google Chrome or Chromium (the machine's capability report names the command), then call again.";

/** The canvas's address for a read: its files, the state's scheme and width, drawn as the stage's own page. Each file is read whole: what a person's graph names is the hub's to keep (core `namedKept`). */
const pageUrl = (origin: string, ask: RenderAsk): string => {
  const query = new URLSearchParams();
  for (const file of ask.files) {
    query.append("file", file);
  }
  query.set("by", "stage");
  if (ask.state) {
    query.set(RENDER_STATE_PARAM, ask.state.story);
  }
  if (ask.state?.scheme) {
    query.set("scheme", ask.state.scheme);
  }
  if (ask.state?.width) {
    query.set("width", String(ask.state.width));
  }
  if (ask.measure) {
    query.set(MEASURE_PARAM, "1");
  }
  return `${origin}${CANVAS_PATH}?${query}`;
};

/** The page's sweep as last read: none before its runtime has booted (runtime.ts `CanvasState`). */
type SweepRead = NonNullable<ReturnType<typeof sweepNow>>;

/**
 * The page's sweep now: null when the page has no canvas yet; `stopped`
 * when its read failed. Read inside a wait on the page's own reports
 * ({@link sweepUntil}, {@link readKept}), which lets a page that stopped
 * answering go.
 */
const sweepOf = (page: Page): Effect.Effect<SweepRead | null | "stopped"> =>
  fromPromise(() => page.evaluate(sweepNow)).pipe(
    Effect.orElseSucceed(() => "stopped" as const)
  );

/**
 * Each states file's first story, by the plans the stage wrote into the
 * page (core `CANVAS_PLAN_ID`); null when the plans could not be read. Read
 * inside a wait on the page's own reports, as {@link sweepOf} is.
 */
const firstStories = (
  page: Page
): Effect.Effect<Record<string, string | null> | null> =>
  fromPromise(() => page.evaluate(textNow, CANVAS_PLAN_ID)).pipe(
    Effect.map(storiesOf),
    Effect.orElseSucceed(() => null)
  );

/** {@link firstStories} from the plans' text. */
function storiesOf(said: string | null): Record<string, string | null> | null {
  if (said === null) {
    return null;
  }
  let plans: Record<string, SectionPlan>;
  try {
    plans = sectionPlansOf(JSON.parse(said || "{}"));
  } catch {
    return null;
  }
  return Object.fromEntries(
    Object.entries(plans).map(([file, plan]) => [
      file,
      plan.stories[0]?.name ?? null,
    ])
  );
}

/**
 * The page's sweep, read every {@link POLL_MS} until it has drawn every
 * section it takes, waited on while the page shows life ({@link pageLive};
 * each read that differs from the one before is a sign of life too): its
 * last answer however it ends, so a page that went quiet or a read its
 * asker let go still says how far it got; null when it never said (its
 * runtime never ran). Its plans' first stories are read after.
 */
async function sweepUntil(page: Page, asker: AbortSignal) {
  let last: SweepRead | null = null;
  let said = "";
  const look = (alive: () => void) =>
    Effect.suspend(() => sweepOf(page)).pipe(
      Effect.map((now) => {
        if (now !== "stopped") {
          const text = JSON.stringify(now);
          if (text !== said) {
            said = text;
            alive();
          }
          last = now;
        }
        return last?.swept && last.reports > 0 ? last : undefined;
      })
    );
  const looked = await unlessLetGo(
    asker,
    pageLive(page, asker, (signal, alive) =>
      runPromise(lookUntil({ every: Duration.millis(POLL_MS) }, look(alive)), {
        signal,
      })
    )
  );
  const swept: SweepRead | null =
    looked?.kind === "answered" && looked.value.kind === "found"
      ? looked.value.value
      : last;
  return { swept, firsts: await runPromise(firstStories(page)) };
}

/** `ask.measure`'s move measured on the page a read opened to measure it (stage-measure.ts), from `ask.state`'s story: refused without one, naming `first`, the first story of the canvas's first states file. */
async function measured(
  browser: Browser,
  page: Page,
  ask: RenderAsk,
  at: {
    firsts: Record<string, string | null> | null;
    signal: AbortSignal;
    window: [number, number];
  }
): Promise<MeasureRead> {
  if (!(ask.state && ask.measure)) {
    throw new Error(
      measureWords.noStory(at.firsts?.[ask.files[0] ?? ""] ?? null)
    );
  }
  return await measureMove(browser, page, {
    ask: ask.measure,
    key: await findState(page, ask.state.story),
    scheme: ask.state.scheme ?? "light",
    window: at.window,
    signal: at.signal,
  });
}

/* --- The browser the readers share ------------------------------------- */

/** The daemon's one Chromium for reads, while a page of one is open; null before the first and once the last closed. */
let shared: Promise<Browser> | null = null;
/** The pages open in {@link shared}: kept readers and pictures under way. */
let pagesOpen = 0;

/** A context of its own in the shared browser (launched first when none runs), counted open until {@link closeContext}. */
async function openContext(
  options: Parameters<Browser["newContext"]>[0],
  sandbox: boolean
): Promise<BrowserContext> {
  pagesOpen += 1;
  const launched =
    shared ??
    launchChromium(NO_CHROMIUM, sandbox).then((browser) => {
      // Chromium ended on its own: the next read launches another, and each page it held is found closed.
      browser.on("disconnected", () => {
        if (shared === launched) {
          shared = null;
        }
      });
      return browser;
    });
  shared = launched;
  try {
    return await (await launched).newContext(options);
  } catch (error) {
    pagesOpen -= 1;
    // A launch that failed is not kept: the next read launches again.
    if (shared === launched && pagesOpen === 0) {
      shared = null;
    }
    throw error;
  }
}

/** A context closed; the shared browser closed with the last. */
async function closeContext(context: BrowserContext): Promise<void> {
  pagesOpen -= 1;
  await context.close().catch(() => undefined);
  if (pagesOpen === 0 && shared) {
    const browser = shared;
    shared = null;
    await (await browser.catch(() => null))?.close().catch(() => undefined);
  }
}

/* --- Each stage's pages: its listener and its kept readers ---------------- */

/** One canvas's kept page: the stage's own page of `files`, open while the canvas is in use. */
interface KeptReader {
  /** It was closed: nothing of it is closed again. */
  closed: boolean;
  context: BrowserContext;
  readonly files: string[];
  /** Settles once its page has loaded; rejects with why it did not. */
  loaded: Promise<void>;
  page: Page;
  /** The last read that asked it (`Date.now()`). */
  readAt: number;
}

/** A stage's pages: the address they reach it at, and its kept readers by their files. */
interface StagePages {
  listener: TCPSocketListener<Pipe> | null;
  readonly origin: string;
  readonly reached: string;
  readonly readers: Map<string, KeptReader>;
  /** Reads and pictures under way on it. */
  using: number;
}

/** Each stage's pages, by the stage's key (agent stage.ts `Stage.key`). */
const stagePages = new Map<string, StagePages>();

/** Stage `key`'s pages, reached at `reached` (a unix socket, or `"host"` with the stage's own `port`): its listener made as the first opens. */
async function pagesOf(
  key: string,
  reached: string,
  port: number
): Promise<StagePages> {
  const had = stagePages.get(key);
  if (had?.reached === reached) {
    return had;
  }
  if (had) {
    closeReaders(key);
  }
  const listener = reached === "host" ? null : await listenerFor(reached);
  const made: StagePages = {
    listener,
    origin: `http://127.0.0.1:${listener ? listener.port : port}`,
    reached,
    readers: new Map(),
    using: 0,
  };
  stagePages.set(key, made);
  return made;
}

/** Stage `key`'s pages let go of once none is open and no read is under way: its listener stopped. */
function letGoIfIdle(key: string, pages: StagePages): void {
  if (
    pages.using === 0 &&
    pages.readers.size === 0 &&
    stagePages.get(key) === pages
  ) {
    stagePages.delete(key);
    pages.listener?.stop(true);
  }
}

/** One kept reader closed and forgotten, once. */
function closeReader(pages: StagePages, files: string, kept: KeptReader): void {
  if (pages.readers.get(files) === kept) {
    pages.readers.delete(files);
  }
  if (kept.closed) {
    return;
  }
  kept.closed = true;
  closeContext(kept.context).catch(() => undefined);
}

/**
 * Every kept reader of stage `key` closed, and its listener stopped: the
 * stage sleeps, stops or starts again (stage.ts `kill`). A read under way
 * on one fails ({@link words.readerGone}); the next opens another.
 */
export function closeReaders(key: string): void {
  const pages = stagePages.get(key);
  if (!pages) {
    return;
  }
  stagePages.delete(key);
  for (const [files, kept] of pages.readers) {
    closeReader(pages, files, kept);
  }
  pages.listener?.stop(true);
}

/** Each kept reader of stage `key` no read has asked for in `idleMs` closed: the stage's own idle time (stage.ts `watch`). */
export function idleReaders(key: string, idleMs: number): void {
  const pages = stagePages.get(key);
  if (!pages) {
    return;
  }
  for (const [files, kept] of pages.readers) {
    if (Date.now() - kept.readAt > idleMs) {
      closeReader(pages, files, kept);
    }
  }
  letGoIfIdle(key, pages);
}

/** The kept reader of `files` on `pages`: the one open, or a new one when none is or the one there closed. */
async function keptReader(
  pages: StagePages,
  files: string[],
  sandbox: boolean
): Promise<KeptReader> {
  const key = files.join("\n");
  const had = pages.readers.get(key);
  if (had && !had.closed && !had.page.isClosed()) {
    return had;
  }
  if (had) {
    closeReader(pages, key, had);
  }
  const context = await openContext(
    { viewport: VIEWPORT, colorScheme: "light", hasTouch: false },
    sandbox
  );
  const page = await context.newPage().catch(async (error: unknown) => {
    await closeContext(context);
    throw error;
  });
  const kept: KeptReader = {
    closed: false,
    context,
    files,
    page,
    readAt: Date.now(),
    loaded: Promise.resolve(),
  };
  // A page that did not load is closed and forgotten: the next read opens
  // another. Its load has no time of its own: the read waiting on it lets
  // it go once the page goes quiet ({@link loadedLive}).
  kept.loaded = page
    .goto(pageUrl(pages.origin, { files }), { timeout: 0 })
    .then(
      () => undefined,
      (error: unknown) => {
        closeReader(pages, key, kept);
        throw error;
      }
    );
  pages.readers.set(key, kept);
  // A page that ends on its own (Chromium's crash, its browser gone) is forgotten: the next read opens another.
  page.on("close", () => closeReader(pages, key, kept));
  return kept;
}

/** The stage's report of `files`, as it keeps it now, the host's problems left out (the daemon reads them as the stage's, `ensureStage`). */
async function stageReport(
  origin: string,
  files: readonly string[]
): Promise<RenderReport> {
  const query = new URLSearchParams(
    files.map((file): [string, string] => ["file", file])
  );
  const answer = await fetch(`${origin}${REPORT_PATH}?${query}`);
  if (!answer.ok) {
    throw new Error(`The stage did not answer its report (${answer.status}).`);
  }
  const { errors: _errors, ...report } = ReportAnswerSchema.parse(
    await answer.json()
  );
  return report;
}

/**
 * The kept reader's page loaded, waited on while it shows life
 * ({@link pageLive}): one that went quiet first is closed, the next read
 * opening another; one closed under it fails as gone.
 */
async function loadedLive(
  pages: StagePages,
  kept: KeptReader,
  asker: AbortSignal
): Promise<void> {
  const loaded = await pageLive(kept.page, asker, () => kept.loaded).catch(
    (error: unknown) => {
      throw kept.closed ? new Error(words.readerGone) : error;
    }
  );
  if (loaded.kind === "unanswered") {
    closeReader(pages, kept.files.join("\n"), kept);
    throw new Error(
      loaded.reason === "dead" ? words.readerGone : words.notLoaded
    );
  }
}

/**
 * The report of `files` once their kept reader has read them as they
 * stand: the stage's report, read every {@link POLL_MS}, until it owes no
 * read of them (core `readerOwed`), waited on while the page shows life
 * ({@link pageLive}); a page gone quiet, or a read its asker let go,
 * answers as far as it got. A file it owes that the page is not reading (a
 * change reached the file and no module of the page, or its load failed)
 * is asked of the page again, once for each content of it. Fails when the
 * page closes under it.
 */
async function readKept(
  pages: StagePages,
  files: string[],
  sandbox: boolean,
  asker: AbortSignal
): Promise<Rendered> {
  const kept = await keptReader(pages, files, sandbox);
  kept.readAt = Date.now();
  await loadedLive(pages, kept, asker);
  const { page } = kept;
  /** The content of each file last asked to be read again, by its hash. */
  const asked = new Map<string, string>();
  /** When each owed file was first seen with the page reading none of it, by its file. */
  const idleSince = new Map<string, number>();
  let report = await stageReport(pages.origin, files);
  let said: SweepRead | null = null;
  let looks = 0;
  /** The report and the sweep as the last look read them: a look that reads them otherwise is the page's sign of life. */
  let lastRead = "";
  /** The wait's sign of life, once the wait below has begun. */
  let alive: () => void = () => undefined;
  const heardMove = (): void => {
    const read = JSON.stringify([report, said]);
    if (read !== lastRead) {
      lastRead = read;
      alive();
    }
  };
  // One look: the report read again (after the first), done once it owes nothing; else the page's sweep read, and each owed file it is not reading asked of it again.
  const look = fromPromise(async (): Promise<boolean> => {
    if (looks > 0) {
      report = await stageReport(pages.origin, files);
    }
    looks += 1;
    const owed = readerOwed(report);
    if (owed.length === 0) {
      return true;
    }
    if (kept.closed) {
      throw new Error(words.readerGone);
    }
    const now = await runPromise(sweepOf(page));
    if (now !== "stopped") {
      said = now;
    }
    heardMove();
    const reading = new Set(said?.swept ? said.drawing : files);
    const idle = owed.filter((file) => {
      if (reading.has(file)) {
        idleSince.delete(file);
        return false;
      }
      const since = idleSince.get(file) ?? Date.now();
      idleSince.set(file, since);
      const hash = report.sections.find((one) => one.file === file)?.hash;
      return Date.now() - since >= READ_AGAIN_MS && asked.get(file) !== hash;
    });
    if (idle.length > 0) {
      for (const file of idle) {
        asked.set(
          file,
          report.sections.find((one) => one.file === file)?.hash ?? ""
        );
      }
      await page.evaluate(readAgainNow, idle).catch((error: unknown) => {
        throw kept.closed ? new Error(words.readerGone) : error;
      });
    }
    return false;
  });
  // Waited on while the page shows life or the stage's report moves: one
  // that went quiet, or a read its asker let go, says how far it got.
  const waited = await unlessLetGo(
    asker,
    pageLive(page, asker, (signal, heard) => {
      alive = heard;
      return runPromise(
        lookUntil(
          { every: Duration.millis(POLL_MS), until: (done: boolean) => done },
          look
        ).pipe(
          Effect.andThen(() =>
            readerOwed(report).length === 0
              ? Effect.succeed(null)
              : firstStories(page)
          )
        ),
        { signal }
      );
    })
  );
  const firsts = waited?.kind === "answered" ? waited.value : null;
  if (kept.closed) {
    throw new Error(words.readerGone);
  }
  const owed = new Set(readerOwed(report));
  if (owed.size === 0) {
    return { report, undrawn: [] };
  }
  return {
    report,
    undrawn: files
      .filter((file) => owed.has(file))
      .map((file) => ({
        file,
        at: said?.sweepAt?.file === file ? said.sweepAt : null,
        asked: true,
        first: firsts?.[file] ?? null,
      })),
    ...(firsts ? {} : ({ plansUnread: true } as const)),
  };
}

/** `page` loaded at `url`, waited on while it shows life ({@link pageLive}); one gone quiet first, or closed, fails in words. */
async function gotoLive(
  page: Page,
  url: string,
  asker: AbortSignal
): Promise<void> {
  const loaded = await pageLive(page, asker, (signal) =>
    untilLetGo(signal, page.goto(url, { timeout: 0 }))
  );
  if (loaded.kind === "unanswered") {
    throw new Error(
      loaded.reason === "dead" ? words.readerGone : words.notLoaded
    );
  }
}

/** State `key` posed for its picture (frame-picture.ts `poseState`), waited on while its page shows life; one gone quiet first, or closed, fails in words. */
async function posedLive(
  page: Page,
  key: string,
  asker: AbortSignal
): Promise<void> {
  const posed = await pageLive(page, asker, (signal) =>
    poseState(page, key, signal)
  );
  if (posed.kind === "unanswered") {
    throw new Error(
      posed.reason === "dead" ? words.readerGone : words.unsettled(key)
    );
  }
}

/**
 * A state's picture, the stage's in view, or a measured move: drawn on a
 * page of its own in the shared browser at the state's scheme and width,
 * its section read as a kept reader reads it, then posed; closed once it
 * answers.
 */
async function drawAsked(
  pages: StagePages,
  ask: RenderAsk,
  sandbox: boolean,
  asker: AbortSignal
): Promise<Rendered> {
  const opened = browserFor(ask.state?.width);
  const context = await openContext(
    {
      viewport: opened.viewport,
      colorScheme: ask.state?.scheme ?? "light",
      // Chromium's touch emulation (CDP `Emulation.setTouchEmulationEnabled`): `(pointer: coarse)` and `(hover: none)` hold, measured.
      hasTouch: opened.touch,
    },
    sandbox
  );
  try {
    const page = await context.newPage();
    await gotoLive(page, pageUrl(pages.origin, ask), asker);
    const { swept, firsts } = await sweepUntil(page, asker);
    const { state } = ask;
    const done = !!swept?.swept && swept.reports > 0;
    // A state's picture needs its section drawn: with none, the read says where it stood and what to do instead.
    if (state && !done) {
      throw new Error(words.stateUndrawn(state.story, swept?.sweepAt ?? null));
    }
    if (done) {
      await page.waitForTimeout(SETTLE_MS);
    }
    const drawn = new Set(swept?.drawn ?? []);
    const unread = firsts ? {} : ({ plansUnread: true } as const);
    const undrawn: SectionUndrawn[] = ask.files
      .filter((file) => !drawn.has(file))
      .map((file) => ({
        file,
        at: swept?.sweepAt?.file === file ? swept.sweepAt : null,
        asked: swept?.sweeps.includes(file) ?? true,
        first: firsts?.[file] ?? null,
      }));
    // The stage's report: every section as its last draw left it, the ones this read drew and the ones it did not.
    const report = await stageReport(pages.origin, ask.files);
    if (ask.measure) {
      const browser = context.browser();
      if (!browser) {
        throw new Error(words.readerGone);
      }
      return {
        report,
        undrawn,
        ...unread,
        measured: await measured(browser, page, ask, {
          firsts,
          // Its asker's: a measurement let go answers the repeats it ran, its report already read.
          signal: asker,
          window: [opened.viewport.width, opened.viewport.height],
        }),
      };
    }
    if (!state) {
      return {
        report,
        undrawn,
        ...unread,
        png: (await page.screenshot()).toString("base64"),
      };
    }
    const key = await findState(page, state.story, state.interaction);
    await posedLive(page, key, asker);
    // The guides laid over the state as it stands posed, so the picture shows what the read says.
    const layout = ask.layout ? await page.evaluate(layoutNow, key) : null;
    if (ask.layout && !layout) {
      throw new Error(words.layoutUnread(state.story));
    }
    return {
      report,
      undrawn,
      ...unread,
      ...(layout ? { layout } : {}),
      png: (await statePicture(page, key)).png.toString("base64"),
    };
  } finally {
    await closeContext(context);
  }
}

/**
 * The canvas of `ask.files` read on the stage keyed `key` (stage.ts
 * `Stage.key`), reached at `reached` (a unix socket, or `"host"` with the
 * stage's own `port`), in the machine's Chromium: a plain read answers the
 * stage's report once the canvas's kept reader has read the files as they
 * stand; a picture, a state's or the stage's in view, or a measured move
 * is drawn on a page of its own (with `layout`, the state's alignment
 * guides laid over its picture and their read beside it).
 */
export async function renderCanvas(
  key: string,
  reached: string,
  port: number,
  ask: RenderAsk,
  /** Its asker's: aborts once the hub lets the read go, which answers what it drew by then. */
  signal: AbortSignal,
  /** Chromium's own sandbox: the daemon's rule ({@link chromiumSandboxed}) unless the caller knows its own. */
  sandbox = chromiumSandboxed()
): Promise<Rendered> {
  const pages = await pagesOf(key, reached, port);
  pages.using += 1;
  try {
    return ask.state || ask.png || ask.measure
      ? await drawAsked(pages, ask, sandbox, signal)
      : await readKept(pages, ask.files, sandbox, signal);
  } finally {
    pages.using -= 1;
    letGoIfIdle(key, pages);
  }
}
