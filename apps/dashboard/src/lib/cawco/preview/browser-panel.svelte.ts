/**
 * One browser artifact's view, shared by the panel's head (PreviewPane: Take
 * over, Hand back, More's Sound on, Reload stream and Stop browser) and its
 * well (BrowserView: the band, the stream, every state's cover), and by the
 * head-less view of `routes/browser/[id]`.
 *
 * - **The browser's row** is the hub's (core `ListedBrowser`, hub
 *   browsers.ts), with what the machine says of it now (`why`, `progress`,
 *   `origin`), as the pane's store holds it (pane-fleet.ts): the app's
 *   socket's `browser_list` frames, or an artifact tab's own frame. Both
 *   come whole on open and on every change, so the view never reads it. An
 *   act's answer stands over it until the next frame.
 * - **The person's acts** are the hub's routes: `/takeover` (with this
 *   view's neko session once it has one, which control is given to;
 *   sent again when it arrives after the take-over), `/handback`,
 *   `/start`, `/stop`. A refusal is said in the error formula, the hub's
 *   own sentence inside it.
 * - **The page's origin** is the machine's (core `BrowserRow.origin`): the
 *   page the stream shows, read through its own DevTools link, live through
 *   a take-over. Before the browser is live, an open browser ask's origin
 *   stands for it; a live browser with no page says so.
 */

import type {
  BrowserKey,
  BrowserRow,
  BrowserState,
  ListedBrowser,
} from "@cawco/core/browser";
import { untrack } from "svelte";
import { cawco } from "../client.svelte";
import { failureWords, hubRefusal } from "../hub-read";
import { resolveSessionTitle } from "../links";
import type { PaneBrowserAsk, PaneFleet } from "./pane-fleet";
import {
  type StreamSource,
  type StreamStatus,
  BROWSER_WORDS as words,
} from "./source";

/** A browser as its machine answers an act (core `BrowserRow`), `/start` and `/takeover` alike. */
type MachineRow = Omit<Partial<BrowserRow>, "state"> & { state: BrowserState };

/** Why Take over waits on a live browser whose stream stands so: none while it draws. */
const STREAM_WAITS: Partial<Record<StreamStatus["kind"], string>> = {
  unreached: words.takeOverWaits.unreached,
  unoffered: words.takeOverWaits.unoffered,
  lost: words.takeOverWaits.lost,
  reconnecting: words.takeOverWaits.reconnecting,
};

/** What the person is doing to the browser now. */
export type BrowserAct = "takeover" | "handback" | "start" | "stop";

/**
 * Where the view stands, as the well draws it: nothing known yet, the
 * machine away, asleep, starting, failed, or live (the stream's own status
 * then says the rest).
 */
export type BrowserPhase =
  "reading" | "away" | "asleep" | "starting" | "failed" | "live";

export interface BrowserPanelPlace {
  artifactId: string;
  instanceId: string;
  key: BrowserKey;
  /** The asking session's machine: the browser's. */
  machineId: string;
}

const post = async <T>(path: string, body: object): Promise<T> => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await hubRefusal(response);
  }
  return (await response.json()) as T;
};

export class BrowserPanel {
  readonly place: BrowserPanelPlace;
  readonly #fleet: PaneFleet;
  /**
   * An act's answer, over the listed row it answered: it stands while that
   * row is the one listed, and the next frame replaces both.
   */
  #answered = $state.raw<{
    over: ListedBrowser | null | undefined;
    row: ListedBrowser;
  } | null>(null);
  stream = $state<StreamStatus>({ kind: "connecting" });
  /** This view's neko session (container host), once its socket said `system/init`. */
  viewer = $state<string | null>(null);
  acting = $state<BrowserAct | null>(null);
  /** The last refused act, in the error formula. */
  refusal = $state<string | null>(null);
  soundOn = $state(false);
  /** Bumped by Reconnect, Try again and Reload stream: the stream starts over. */
  generation = $state(0);
  /** The stream drawing in the well now, for Sound on and the keyboard. */
  source: StreamSource | null = null;
  /** The viewer `/takeover` last carried: sent again only for a new one. */
  #sentViewer: string | null = null;
  /**
   * Which session asked each browser ask seen open for this browser, by its
   * request: the ask leaves every screen as it is taken, and the take-over
   * keeps only its request and the asking workspace.
   */
  #askers = $state<Record<string, string>>({});

  constructor(place: BrowserPanelPlace, fleet: PaneFleet) {
    this.place = place;
    this.#fleet = fleet;
  }

  /** The hub's row: undefined until the pane's store has heard the list, null while the machine has reported none for this key. */
  get row(): ListedBrowser | null | undefined {
    const listed = this.#fleet.browser(this.place.key, this.place.machineId);
    const answered = this.#answered;
    return answered && answered.over === listed ? answered.row : listed;
  }

  /** Stands `row` over the listed row until the next frame. */
  #keep(row: ListedBrowser): void {
    this.#answered = {
      over: this.#fleet.browser(this.place.key, this.place.machineId),
      row,
    };
  }

  /** The machine the browser runs on, as the pane's store lists it. */
  get #machine() {
    return this.#fleet.machines.find(
      (one) => one.machineId === this.place.machineId
    );
  }

  /** The browser ask open in this session's panel for this browser, as the pane's store has it; null for none. */
  get ask(): PaneBrowserAsk | null {
    const { instanceId, artifactId, key } = this.place;
    return this.#fleet.browserAsk(instanceId, artifactId, key);
  }

  /** The page's origin the band names: the live browser's front page, else (before it is live) the open ask's. */
  get origin(): string | null {
    if (this.row?.state === "live") {
      return this.row.origin ?? null;
    }
    return this.ask?.browserAsk?.origin ?? null;
  }

  get held(): boolean {
    return !!this.row?.takeover;
  }

  /**
   * Who holds it, when another session's ask is what the person took over:
   * its title (the band's "asked by <session>"); null while this session
   * asked, or nobody did, or the asker was never seen here.
   */
  get askedBy(): string | null {
    const takeover = this.row?.takeover;
    if (!takeover) {
      return null;
    }
    const asker =
      (takeover.requestId ? this.#askers[takeover.requestId] : undefined) ??
      takeover.by;
    const row = cawco.instances.find((one) => one.id === asker);
    if (!row || row.id === this.place.instanceId) {
      return null;
    }
    return resolveSessionTitle({ title: row.title, cwd: row.cwd, id: row.id });
  }

  /**
   * Keeps every open browser ask for this browser, by request, with the
   * session that asked it: the view calls it in an effect, so it runs as
   * asks open.
   */
  noteAskers(): void {
    const seen: Record<string, string> = {};
    for (const row of cawco.instances) {
      for (const one of cawco.session(row.id)?.pending ?? []) {
        if (one.browserAsk?.key === this.place.key) {
          seen[one.requestId] = row.id;
        }
      }
    }
    const kept = untrack(() => this.#askers);
    if (Object.keys(seen).some((id) => kept[id] !== seen[id])) {
      this.#askers = { ...kept, ...seen };
    }
  }

  get phase(): BrowserPhase {
    const machine = this.#machine;
    if (machine && !machine.online) {
      return "away";
    }
    const { row } = this;
    if (row === undefined) {
      return "reading";
    }
    switch (row?.state) {
      case "live":
        return "live";
      case "pulling":
      case "building":
      case "starting":
        return "starting";
      case "failed":
        return "failed";
      default:
        return "asleep";
    }
  }

  /** The machine's name, as every sentence names it. */
  get machineName(): string {
    return this.row?.machineName ?? this.#machine?.hostname ?? "its machine";
  }

  /** The install command the machine's capability report offers, while its browser runs locally. */
  get install(): string | null {
    const machine = cawco.machines.find(
      (one) => one.machineId === this.place.machineId
    );
    const item = machine?.machineCapabilities?.items.find(
      (one) => one.id === "container-runtime"
    );
    return item && !item.available && item.installCommand
      ? item.installCommand
      : null;
  }

  /** Why Take over waits, said in its title; null while it can be pressed. */
  get takeOverWaits(): string | null {
    switch (this.phase) {
      case "away":
        return words.takeOverWaits.away(this.machineName);
      case "asleep":
        return words.takeOverWaits.asleep;
      case "starting":
      case "reading":
        return words.takeOverWaits.starting;
      case "failed":
        return words.takeOverWaits.failed;
      default:
        return STREAM_WAITS[this.stream.kind] ?? null;
    }
  }

  async #act<T>(
    act: BrowserAct,
    work: () => Promise<T>,
    refused: (said: string) => string
  ): Promise<T | undefined> {
    if (this.acting) {
      return;
    }
    this.acting = act;
    this.refusal = null;
    try {
      return await work();
    } catch (error) {
      this.refusal = refused(failureWords(error));
    } finally {
      this.acting = null;
    }
  }

  #route(act: string): string {
    return `/api/browsers/${encodeURIComponent(this.place.key)}/${act}`;
  }

  /** Take over: privately, from this panel; control goes to this view's neko session once it has one. */
  async takeOver(): Promise<void> {
    const { ask } = this;
    await this.#act(
      "takeover",
      async () => {
        const { viewer } = this;
        const answer = await post<{ row: MachineRow }>(
          this.#route("takeover"),
          {
            instanceId: this.place.instanceId,
            machineId: this.place.machineId,
            ...(ask ? { requestId: ask.requestId } : {}),
            ...(viewer ? { viewer } : {}),
          }
        );
        this.#sentViewer = viewer;
        this.#merge(answer.row);
      },
      words.refused.takeover
    );
  }

  /**
   * This view's neko session arrived (or changed) while the person holds
   * the browser: the take-over is sent again with it, so control is this
   * view's (hub browsers.ts: "Sent again (a viewer's neko session now
   * known)").
   */
  async giveControlHere(): Promise<void> {
    const { viewer } = this;
    if (
      !(viewer && this.held && this.row?.host === "container") ||
      viewer === this.#sentViewer ||
      this.acting
    ) {
      return;
    }
    this.#sentViewer = viewer;
    await post(this.#route("takeover"), {
      instanceId: this.place.instanceId,
      machineId: this.place.machineId,
      viewer,
    }).catch((error: unknown) => {
      this.#sentViewer = null;
      this.refusal = words.refused.takeover(failureWords(error));
    });
  }

  async handBack(): Promise<void> {
    await this.#act(
      "handback",
      async () => {
        await post(this.#route("handback"), {
          machineId: this.place.machineId,
        });
        this.#sentViewer = null;
        if (this.row) {
          this.#keep({ ...this.row, takeover: null });
        }
      },
      words.refused.handback
    );
  }

  async start(): Promise<void> {
    await this.#act(
      "start",
      async () => {
        // Starting until the machine answers: a cold start may build the image first.
        if (this.row) {
          this.#keep({ ...this.row, state: "starting", why: undefined });
        }
        this.#merge(
          await post<MachineRow>(this.#route("start"), {
            machineId: this.place.machineId,
          })
        );
        this.generation += 1;
      },
      words.refused.start
    );
  }

  async stop(): Promise<void> {
    await this.#act(
      "stop",
      async () => {
        const row = await post<MachineRow | null>(this.#route("stop"), {
          machineId: this.place.machineId,
        });
        if (row) {
          this.#merge(row);
        }
      },
      words.refused.stop
    );
  }

  /** A machine's answer (core `BrowserRow`) over the listed row, keeping what only the list says. */
  #merge(answer: MachineRow): void {
    const was = this.row;
    this.#keep({
      key: this.place.key,
      machineId: this.place.machineId,
      machineName: was?.machineName ?? this.machineName,
      projectId: was?.projectId ?? null,
      name: answer.name ?? was?.name ?? "",
      host: answer.host ?? was?.host ?? "container",
      lastUsedAt: answer.lastUsedAt ?? was?.lastUsedAt ?? Date.now(),
      state: answer.state,
      takeover: answer.takeover
        ? {
            by: answer.takeover.by ?? "",
            requestId: answer.takeover.requestId ?? null,
            since: answer.takeover.since,
          }
        : null,
      ...(answer.why ? { why: answer.why } : {}),
      ...(answer.progress ? { progress: answer.progress } : {}),
      ...(answer.origin ? { origin: answer.origin } : {}),
    });
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    this.source?.sound(on);
  }

  /** Reconnect, Try again, Reload stream: the stream starts over. */
  restream(): void {
    this.stream = { kind: "connecting" };
    this.generation += 1;
  }
}
