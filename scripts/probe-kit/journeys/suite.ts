/**
 * The journey suite: one suite of user journeys that proves the product
 * works for the person. Each journey is a flow the operator does, start to
 * finish (JOURNEY.md's Flows), on a real scratch fleet against the mock
 * model, asserting the outcome the flow promises on the hub (or the
 * machine) and on what the page says, never that a control exists.
 *
 *   bun scripts/probe-kit/run.ts journeys [name…] [--engine chromium|webkit|firefox] [--size phone|tablet|desk]
 *
 * Every journey runs on all three engines at three sizes (390×844 phone and
 * 768×1024 tablet, both touch; 1440×900 desk), the same steps and
 * assertions everywhere, once with normal data and once stretched (titles
 * three times longer, twice as many items, seeded through the hub's API).
 * One fleet per journey; its legs run one after another, each in a browser
 * context of its own. After every step the page is held to scan.ts's two
 * rules (nothing spills, no control covers text) and to no console error
 * since the step before.
 *
 * Locators are the person's: roles, labels and the words on the page, never
 * classes or data attributes.
 *
 * One line per journey × engine × size × data: `PASS <journey>: <leg>`, or
 * `FAIL <journey>: <leg> (step N “…”: what it measured)`. It runs once per
 * nightly release, not per change.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConsoleMessage, Locator, Page } from "playwright-core";
import { MACHINE, type Reply, type Seen } from "../../scratch-fleet";
import {
  type Engine,
  type Kit,
  type KitFleet,
  type Spec,
  settle,
  type View,
} from "../kit";
import { scan } from "./scan";

export const ENGINES = ["chromium", "webkit", "firefox"] as const;
export const SIZES = ["phone", "tablet", "desk"] as const;
export type Size = (typeof SIZES)[number];
export const DATA = ["normal", "stretched"] as const;
export type Data = (typeof DATA)[number];

/** Each size as the kit's viewport. */
const VIEW_OF: Record<Size, View> = {
  phone: "phone",
  tablet: "tabletPortrait",
  desk: "desk",
};

/**
 * How long one leg may run before it fails as hung: the longest, J5's, waits
 * for a Mac, lands through the gate's build and is reviewed twice.
 */
const LEG_MS = 25 * 60_000;

/** A step's outcome did not hold: what it measured. */
export class Unmet extends Error {}

/** Fails the step, saying what was measured. */
export function unmet(measured: string): never {
  throw new Unmet(measured);
}

/** Holds `ok`, or fails the step with `what` and what was measured. */
export function expect(what: string, ok: boolean, measured: unknown): void {
  if (!ok) {
    unmet(
      `${what}: ${typeof measured === "string" ? measured : JSON.stringify(measured)}`
    );
  }
}

/**
 * Reads until `accept` holds, or fails the step with `what` and the last
 * reading: a wait that names what it saw, never only that it timed out.
 */
export async function eventually<T>(
  what: string,
  read: () => T | Promise<T>,
  accept: (value: T) => boolean,
  ms = 30_000
): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  let error: unknown;
  for (;;) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each look follows the last state
      last = await read();
      error = undefined;
      if (accept(last)) {
        return last;
      }
    } catch (caught) {
      error = caught;
    }
    if (Date.now() >= deadline) {
      unmet(
        `${what}, not within ${ms / 1000}s: last read ${(error === undefined
          ? JSON.stringify(last)
          : `an error, ${error instanceof Error ? error.message : String(error)}`
        ).slice(0, 600)}`
      );
    }
    await Bun.sleep(250);
  }
}

/**
 * `locator` shows on the page, or the step fails saying so. Only what is
 * shown counts: a session's pane stays mounted, hidden, while another is
 * open, and its words are not on the person's screen.
 */
export async function shows(
  locator: Locator,
  what: string,
  ms = 30_000
): Promise<void> {
  await locator
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: ms })
    .catch(() => unmet(`the page never showed ${what} within ${ms / 1000}s`));
}

/** Nothing `locator` finds shows on the page, or the step fails saying so. */
export async function gone(
  locator: Locator,
  what: string,
  ms = 30_000
): Promise<void> {
  await locator
    .filter({ visible: true })
    .first()
    .waitFor({ state: "hidden", timeout: ms })
    .catch(() => unmet(`the page still shows ${what} after ${ms / 1000}s`));
}

export interface StepOptions {
  /**
   * The hub is down for some of this step: the browser's own word on a
   * request it could not make (“Failed to load resource”, “WebSocket
   * connection to … failed”) is what that is, not the page's error.
   */
  hubDown?: boolean;
}

/** One leg: a journey on one engine, at one size, with one data set. */
export interface Leg {
  base: string;
  data: Data;
  engine: Engine;
  fleet: KitFleet;
  /** A short id for this leg, for words the mock and the machine see. */
  id: string;
  page: Page;
  /** What the journey's `seed` returned for this data set. */
  seeded: unknown;
  size: Size;
  /**
   * One step: the action in the person's words, then its outcome (on the
   * hub and on the page), then the page rules and the console.
   */
  step: (
    does: string,
    act: () => Promise<unknown>,
    outcome: () => Promise<unknown>,
    options?: StepOptions
  ) => Promise<void>;
  /** A title as this data set has it: three times as long when stretched. */
  title: (words: string) => string;
}

export interface Journey {
  /**
   * What the journey leaves on the fleet that the next leg must not find
   * (a rule a failed leg never deleted), put away after every leg, however
   * it ended.
   */
  clean?: (fleet: KitFleet) => Promise<void>;
  /** What the journey proves, from JOURNEY.md. */
  flow: string;
  /**
   * The machine id the hub runs under, where it must not be the agent's:
   * a hub on the agent's own id takes that agent for its own machine and
   * serves it in place (a marketplace on the hub's disk is linked, never
   * sent), where every other machine is sent the bytes.
   */
  hubMachine?: string;
  /** Runs one leg's steps. */
  leg: (leg: Leg) => Promise<void>;
  name: string;
  /** The mock model's answers on this journey's fleet. */
  respond: (seen: Seen) => Reply;
  /**
   * Seeds what a data set needs on top of the fleet's own (through the
   * hub's API), once per data set, before its legs: its answer is each
   * leg's `seeded`.
   */
  seed?: (fleet: KitFleet, data: Data) => Promise<unknown>;
}

/** A title three times as long, as the stretched data set has every title. */
const stretch = (data: Data) => (words: string) =>
  data === "stretched" ? `${words} — ${words} — ${words}` : words;

/**
 * What every data set seeds through the hub's API before its legs, beside
 * what the journey does: projects on the scratch machine, so the board has
 * the furniture a person's has. Normal: three. Stretched: three more, their
 * names three times as long, twice as many in all.
 */
const PROJECT_NAMES = ["Billing service", "Marketing site", "Mobile app"];
async function furnish(fleet: KitFleet, data: Data): Promise<void> {
  const long = stretch(data);
  for (const [at, name] of PROJECT_NAMES.entries()) {
    const dir = join(fleet.sandbox, `${data}-project-${at}`);
    // biome-ignore lint/performance/noAwaitInLoops: one project at a time, as a person makes them
    await mkdir(dir, { recursive: true });
    await Bun.$`git init -q -b main ${dir}`.quiet();
    await fleet.api("/api/projects", {
      name: long(name),
      machineId: MACHINE,
      cwd: dir,
      caw: false,
    });
  }
}

/**
 * Boots a fleet as a person's: sessiond, the hub, the signed-in account, the
 * agent, and onboarding's one choice answered as a person answers it once
 * (`PUT /api/fleet/choices`, agents kept off other people's repositories),
 * so what needs them is only what the journey raises.
 */
export async function bootFleet(
  fleet: KitFleet,
  hubMachine?: string
): Promise<void> {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  await hubUp(fleet, hubMachine);
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const chose = await fetch(`${fleet.base}/api/fleet/choices`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upstream: false }),
  });
  if (!chose.ok) {
    throw new Error(
      `the fleet's upstream choice was refused: ${chose.status} ${await chose.text()}`
    );
  }
}

/** The hub launched, under `hubMachine` when given, and answering. */
export async function hubUp(
  fleet: KitFleet,
  hubMachine?: string
): Promise<void> {
  if (hubMachine) {
    fleet.env.CAWCO_MACHINE_ID = hubMachine;
  }
  fleet.launch("hub");
  fleet.env.CAWCO_MACHINE_ID = MACHINE;
  await fleet.hubUp();
}

/**
 * The fleet as the next leg needs it, however this one ended: the hub up
 * with the machine online (a leg that failed with it stopped), and every
 * session the leg started stopped, so nothing it raised waits on the next.
 */
async function restore(
  fleet: KitFleet,
  since: number,
  hubMachine?: string
): Promise<void> {
  const up = await fetch(`${fleet.base}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) {
    await hubUp(fleet, hubMachine);
  }
  await eventually(
    "the machine online on the hub",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (rows) =>
      rows.some((row) => row.machineId === MACHINE && row.status === "online"),
    120_000
  );
  const started = fleet.query<{ id: string }>(
    "SELECT id FROM instances WHERE spawned_at >= ? AND status IN ('starting', 'running')",
    since
  );
  for (const { id } of started) {
    // biome-ignore lint/performance/noAwaitInLoops: one stop at a time, as the dashboard sends them
    await fleet.stopSession(id);
  }
  await eventually(
    "the hub holds no ask",
    () => fleet.api<unknown[]>("/api/pending"),
    (asks) => asks.length === 0,
    60_000
  );
}

/** What a failed step measured: its own words, or where a script error came from. */
function measuredBy(error: unknown): string {
  if (error instanceof Unmet) {
    return error.message;
  }
  if (error instanceof Error) {
    return (error.stack ?? error.message).split("\n").slice(0, 4).join(" ⏎ ");
  }
  return String(error);
}

/** The browser's own line for a request it could not make while the hub is down. */
const NETWORK_LINE =
  /Failed to load resource|WebSocket connection to .* failed|NetworkError when attempting to fetch|Firefox can.t establish a connection|Could not connect to the server|WebSocket is closed before the connection is established|The network connection was lost|Load failed/i;

/** Which legs to run: every engine, size and data set unless narrowed. */
export interface Narrow {
  engines: readonly Engine[];
  sizes: readonly Size[];
}

/** A journey as a kit spec: one fleet, then its legs in order, one line each. */
export function journeySpec(journey: Journey, narrow: Narrow): Spec {
  return {
    name: journey.name,
    run: async (kit) => {
      const fleet = await kit.fleet(journey.respond);
      await bootFleet(fleet, journey.hubMachine);
      const base = await fleet.dashboard();
      for (const data of DATA) {
        // biome-ignore lint/performance/noAwaitInLoops: one data set after the other, on one fleet
        await furnish(fleet, data);
        const seeded = journey.seed ? await journey.seed(fleet, data) : null;
        for (const engine of narrow.engines) {
          for (const size of narrow.sizes) {
            // biome-ignore lint/performance/noAwaitInLoops: one leg at a time, on one fleet
            await runLeg(kit, journey, {
              base,
              data,
              engine,
              fleet,
              seeded,
              size,
            });
          }
        }
      }
    },
  };
}

async function runLeg(
  kit: Kit,
  journey: Journey,
  at: {
    base: string;
    data: Data;
    engine: Engine;
    fleet: KitFleet;
    seeded: unknown;
    size: Size;
  }
): Promise<void> {
  const label = `${at.engine} · ${at.size} · ${at.data}`;
  const id = `${at.engine}-${at.size}-${at.data}`;
  const out = join(kit.out, id);
  await mkdir(out, { recursive: true });
  const page = await kit.page(VIEW_OF[at.size], { engine: at.engine });
  const said: string[] = [];
  let hubDown = false;
  const heard = (message: ConsoleMessage) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (hubDown && NETWORK_LINE.test(text)) {
      return;
    }
    said.push(text.slice(0, 300));
  };
  page.on("console", heard);
  page.on("pageerror", (error) => {
    said.push(`uncaught: ${error.message.slice(0, 300)}`);
  });
  let number = 0;
  let current = "opening the leg";
  const step: Leg["step"] = async (does, act, outcome, options = {}) => {
    number += 1;
    current = `step ${number} “${does}”`;
    hubDown = options.hubDown === true;
    try {
      await act();
      await outcome();
      await settle(page).catch(() => undefined);
      const findings = await page.evaluate(scan);
      expect(
        "nothing spills and no control covers text",
        findings.length === 0,
        findings.join("; ")
      );
      expect(
        "no console error since the step before",
        said.length === 0,
        said.join(" | ")
      );
    } catch (error) {
      // What the page held when the step failed, as text: its accessibility
      // tree, for the reader of a failure. Never a picture.
      await page
        .locator("body")
        .ariaSnapshot({ timeout: 5000 })
        .then((tree) =>
          writeFile(
            join(out, `step-${number}.aria.yml`),
            `# ${current}\n# ${page.url()}\n${tree}`
          )
        )
        .catch(() => undefined);
      throw error;
    } finally {
      said.length = 0;
      hubDown = false;
    }
  };
  const leg: Leg = {
    ...at,
    id,
    page,
    step,
    title: stretch(at.data),
  };
  const started = performance.now();
  const since = Date.now();
  let failure: string | null = null;
  let timer: Timer | undefined;
  try {
    await Promise.race([
      journey.leg(leg),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Unmet(`the leg ran past ${LEG_MS / 60_000} minutes`)),
          LEG_MS
        );
      }),
    ]);
  } catch (error) {
    failure = `${current}: ${measuredBy(error)}`;
  } finally {
    clearTimeout(timer);
    await page
      .context()
      .close()
      .catch(() => undefined);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(0);
  kit.check(`${label} [${seconds}s]`, failure === null, failure ?? undefined);
  await restore(at.fleet, since, journey.hubMachine);
  await journey.clean?.(at.fleet);
}

/** The run's arguments: journeys named, `--engine` and `--size` narrowing. */
export function parse(rest: string[]): {
  names: string[];
  narrow: Narrow;
} {
  const pick = <T extends string>(flag: string, all: readonly T[]): T[] => {
    const at = rest.indexOf(flag);
    if (at === -1) {
      return [...all];
    }
    const value = rest[at + 1] as T | undefined;
    if (!(value && all.includes(value))) {
      console.error(`${flag} takes one of ${all.join(", ")}`);
      process.exit(2);
    }
    return [value];
  };
  const flags = new Set(["--engine", "--size"]);
  const names = rest.filter(
    (one, i) => !(flags.has(one) || flags.has(rest[i - 1] ?? ""))
  );
  return {
    names,
    narrow: {
      engines: pick("--engine", ENGINES),
      sizes: pick("--size", SIZES),
    },
  };
}
