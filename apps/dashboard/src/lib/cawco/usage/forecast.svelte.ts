/**
 * The usage forecast's reader: `/api/accounts/forecast?provider=anthropic`,
 * read whenever the hub's accounts signal fires (on connect, and each
 * `kind: 'usage'` frame: `followAccounts`), and the minute clock every
 * Rings surface counts down by. Every surface (the rail strip, the phone
 * strip, the popover, the sheet, the Usage page, the New session chip)
 * reads the one view derived here, so they never disagree.
 *
 * `cause` says why the view last moved: a new reading ("data") eases arcs
 * and morphs figures; the minute moving on ("clock") changes the words in
 * place, with nothing animated for it.
 */
import type { CarrySpan, ProviderForecast } from "@cawco/core";
import { cawco, followAccounts } from "../client.svelte";
import { speakingReading } from "../usage";
import {
  type ClaudeRings,
  claudeRings,
  openCodeRing,
  type RingAccount,
} from "./rings";

const state = $state({
  forecast: null as ProviderForecast | null,
  /** The forecast has been read once: none since means none, not not-yet. */
  read: false,
  now: Date.now(),
  cause: "data" as "data" | "clock",
});

async function readForecast(): Promise<void> {
  try {
    const response = await fetch("/api/accounts/forecast?provider=anthropic");
    if (!response.ok) {
      return;
    }
    state.forecast = (await response.json()) as ProviderForecast;
    state.read = true;
    state.cause = "data";
    state.now = Date.now();
  } catch {
    // A failed read keeps what was there; the next signal reads again.
  }
}

let started = false;

/** Starts the reader and its minute clock; every Rings surface calls it as it mounts. */
export function startForecast(): void {
  if (started) {
    return;
  }
  started = true;
  followAccounts(() => {
    readForecast();
  });
  readForecast();
  setInterval(() => {
    state.cause = "clock";
    state.now = Date.now();
  }, 60_000);
}

/**
 * A bench's view (routes/motion/usage-relay): its forecast and the rings it
 * built from it with claudeRings/openCodeRing, in place of the hub's.
 */
interface StagedUsage {
  claude: ClaudeRings | null;
  forecast: ProviderForecast;
  openCode: RingAccount | null;
}
let staged = $state<StagedUsage | null>(null);

const claude = $derived.by((): ClaudeRings | null => {
  if (staged) {
    return staged.claude;
  }
  const view = cawco.accounts;
  const { forecast } = state;
  if (!(view && forecast)) {
    return null;
  }
  const rings = claudeRings({
    accounts: view.accounts.filter(
      (account) => account.provider === forecast.provider
    ),
    bench: view.bench,
    forecast,
    instances: cawco.instances,
    now: state.now,
    routing: view.routing.find((one) => one.provider === forecast.provider),
  });
  // An account nothing has reported on yet has no rings to draw.
  const shown = rings.accounts.filter((ring) => ring.w5 || ring.week);
  return shown.length > 0 ? { ...rings, accounts: shown } : null;
});

const openCode = $derived.by((): RingAccount | null => {
  if (staged) {
    return staged.openCode;
  }
  const reading = speakingReading(cawco.openCodeGoLimits)?.reading;
  if (!reading || reading.windows.length === 0) {
    return null;
  }
  return openCodeRing(
    reading,
    cawco.instances.filter(
      (row) =>
        row.harness === "opencode" &&
        (row.status === "running" || row.status === "starting")
    ),
    state.now,
    // Shown beside Claude's accounts: never in a hue one of them wears.
    claude?.accounts.map((ring) => ring.hue) ?? []
  );
});

export const usage = {
  /** Claude's accounts as Rings, and the carry answer; null without a reading. */
  get claude() {
    return claude;
  },
  /** Opencode Go's plan as one ring; null without a reading. */
  get openCode() {
    return openCode;
  },
  /** Who carries your new sessions across the 5-hour horizon, span by span. */
  get spans(): CarrySpan[] {
    return (staged?.forecast ?? state.forecast)?.yours ?? [];
  },
  get read() {
    return staged !== null || state.read;
  },
  /** A bench stands its own view in for the hub's; null hands it back. */
  stage(view: StagedUsage | null) {
    staged = view;
    state.cause = "data";
    state.now = Date.now();
  },
  /** The minute clock. */
  get now() {
    return state.now;
  },
  /** Why the view last moved. */
  get cause() {
    return state.cause;
  },
};
