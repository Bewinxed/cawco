/**
 * Whether this tab reaches the preview's origin: where the hub says an unnamed frame is served, the origin the page runs on, where a show starts, and the probe that waits out an origin that does not answer.
 */
import { probePreview, unreachedOf } from "@cawco/core/preview/reach";
import {
  type PreviewAddress,
  type PreviewSettings,
  previewRoute,
  projectPagePlace,
} from "@cawco/core/preview/routes";
import {
  previewsNeedWords,
  previewUnreachedWords,
} from "@cawco/core/words/preview-reach";
import { untrack } from "svelte";
import { z } from "zod";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { readJson, writeJson } from "#lib/platform/storage.js";
import { track } from "#lib/platform/track.js";
import { pageVisible } from "../page-visible.svelte";
import { hubReach } from "./hub-reach";
import { artifactAddress } from "./page-source";
import type { PaneSubject } from "./pane-subject.svelte";
import { enterPreviews } from "./pass";

/**
 * The preview's own origin, never the dashboard's, picked by where this
 * tab reached the dashboard (core `previewRoute`): host mode's name when
 * under the pattern's domain, else its port on this tab's host. The page
 * runs at its root as on its own server.
 */
/** The frame names an origin of its own: a port, or host mode's name. */
const namesOrigin = (address: { origin?: string; port?: number }): boolean =>
  address.port !== undefined || !!address.origin;
/** Our calls: the first probe again 2 s after a failure, doubling to every 30 s. */
export const PROBE_FIRST_MS = 2000;
export const PROBE_MOST_MS = 30_000;
export interface PreviewReachDeps {
  readonly instanceId: () => string;
  readonly onScreen: () => boolean;
  readonly paneSubject: PaneSubject;
}
export class PreviewReach {
  readonly #deps: PreviewReachDeps;

  /**
   * What the hub said when this pane asked where its open frame is served,
   * the frame naming no origin (the hub opened none for it as it told the
   * frame: every preview port was in use): the address it opened then, or
   * its refusal in its own words (page-source.ts `artifactAddress`), said
   * over the well with Try again, never a cover that waits for nothing.
   */
  hubSaid = $state<
    | { id: string; address: PreviewAddress }
    | { id: string; problem: string }
    | null
  >(null);

  /** Try again's presses: each asks the hub again. */
  addressTries = $state(0);

  addressAsking = $state(false);

  readonly unnamedId = $derived.by(() =>
    this.#deps.paneSubject.preview?.state === "open" &&
    this.#deps.paneSubject.preview.artifact.kind !== "browser" &&
    !namesOrigin(this.#deps.paneSubject.preview)
      ? this.#deps.paneSubject.preview.artifact.id
      : null
  );

  /** The hub's refusal for this pane's frame, while it names no origin. */
  readonly unopened = $derived(
    this.hubSaid &&
      "problem" in this.hubSaid &&
      this.hubSaid.id === this.unnamedId
      ? this.hubSaid.problem
      : null
  );

  // A browser is drawn here from its stream (BrowserView), never framed from an origin.
  readonly route = $derived.by(() => {
    if (
      !this.#deps.paneSubject.preview ||
      this.#deps.paneSubject.preview.artifact.kind === "browser"
    ) {
      return null;
    }
    if (namesOrigin(this.#deps.paneSubject.preview)) {
      return previewRoute(this.#deps.paneSubject.preview, location);
    }
    return this.hubSaid &&
      "address" in this.hubSaid &&
      this.hubSaid.id === this.unnamedId
      ? previewRoute(this.hubSaid.address, location)
      : null;
  });

  readonly paneOrigin = $derived(this.route?.origin ?? "");

  /**
   * Where the reader had gone inside this show, kept per session so a reload
   * of the tab (by hand, or by itself once idle: reload.svelte.ts) opens the
   * preview there again. A new show (another revision) starts at its root.
   */
  readonly keepKey = $derived.by(
    () => `cawco-preview-at:${this.#deps.instanceId()}`
  );

  keptAt = (): string | null => {
    const kept = readJson(
      this.keepKey,
      z
        .object({
          at: z.unknown().optional(),
          revision: z.unknown().optional(),
        })
        .nullable(),
      null
    );
    return kept?.revision === this.#deps.paneSubject.preview?.revision &&
      typeof kept?.at === "string" &&
      kept.at.startsWith("/")
      ? kept.at
      : null;
  };

  /**
   * Where a show starts: a page at its own place on the origin that serves
   * it (core `projectPagePlace`: its project's, else its session's), which
   * holds that page whatever the session's panel shows, so an artifact's
   * own tab never loads another; else, on a machine artifact's own origin,
   * the page the agent named (`path`), else the root.
   */
  readonly startAt = $derived.by(() => {
    if (
      this.#deps.paneSubject.preview?.project ||
      this.#deps.paneSubject.preview?.artifact.kind === "page"
    ) {
      return projectPagePlace(this.#deps.paneSubject.preview.artifact.id);
    }
    return (
      (this.#deps.paneSubject.source && "path" in this.#deps.paneSubject.source
        ? this.#deps.paneSubject.source.path
        : undefined) ?? "/"
    );
  });

  /**
   * The place the frame opens, a path on the preview's origin: the start
   * page, or where the reader was in this show; read once per show, so their
   * going on inside it never reloads the frame.
   */
  readonly framePlace = $derived.by(() => {
    if (!(this.#deps.paneSubject.preview?.revision && this.paneOrigin)) {
      return this.startAt;
    }
    return untrack(this.keptAt) ?? this.startAt;
  });

  /**
   * Host mode's route, its names under the pattern's domain; else the
   * preview's port on this tab's host. Either route is locked to the
   * browser's pass (hub preview-access.ts), which the frame's own load
   * carries, and loads the place straight.
   */
  readonly byHost = $derived(!!this.route?.byHost);

  /**
   * Whether this tab reaches the preview's origin (its `/__cawco/ping`,
   * which answers any page with no credentials, and with the hub's words,
   * still a 200, when the session's machine listener doesn't answer the hub:
   * core `PreviewPingDown`), before the frame loads. Unreached, the pane says
   * what failed by its own cause (core preview-reach.ts: offline, refused at
   * once, no answer in time, answered without its CORS header, the hub's
   * word that it is down, another answerer's status, and whether the hub
   * itself reaches the origin), the fix, and probes again by itself
   * (`PROBE_FIRST_MS`, doubling to `PROBE_MOST_MS`, and at once when its tab
   * is back in view) until one answers: never a fallback. Reached, the
   * browser enters its previews (pass.ts), so the lock never sees this tab
   * without a pass; an entry the hub won't give is unreached the same way,
   * in the hub's words. Once reached and entered, the frame loads, once.
   */
  reached = $state<
    | { origin: string; ok: true }
    | { origin: string; ok: false; said: string; tries: number }
    | null
  >(null);

  /** Each one probes the origin again: Try again's press, the backoff's timer, the tab back in view. */
  probe = $state(0);

  probing = $state(false);

  seenBefore = true;

  readonly unreachedBy = $derived(
    this.reached && !this.reached.ok && this.reached.origin === this.paneOrigin
      ? this.reached
      : null
  );

  readonly unreached = $derived(!!this.paneOrigin && !!this.unreachedBy);

  /** What previews need to be reached from this tab, by the route it took (core `previewsNeedWords`); the hub's port range read once. */
  portsRead: Promise<PreviewSettings | null> | null = null;
  constructor(deps: PreviewReachDeps) {
    this.#deps = deps;
    $effect(() => {
      const id = this.unnamedId;
      track(this.addressTries);
      if (!id) {
        this.hubSaid = null;
        return;
      }
      let live = true;
      this.addressAsking = true;
      artifactAddress(id).then((found) => {
        if (live) {
          this.hubSaid = { id, ...found };
          this.addressAsking = false;
        }
      });
      return () => {
        live = false;
      };
    });
    $effect(() => {
      const origin = this.paneOrigin;
      track(this.probe);
      if (
        !origin ||
        untrack(() => this.reached?.origin === origin && this.reached.ok)
      ) {
        return;
      }
      let live = true;
      this.probing = true;
      this.unreachedWords(origin).then((said) => {
        if (!live) {
          return;
        }
        this.probing = false;
        const was = untrack(() => this.reached);
        this.reached = said
          ? {
              origin,
              ok: false,
              said,
              tries: was?.origin === origin && !was.ok ? was.tries + 1 : 1,
            }
          : { origin, ok: true };
      });
      return () => {
        live = false;
        this.probing = false;
      };
    });
    $effect(() => {
      const failed = this.reached;
      const seen = pageVisible.current && this.#deps.onScreen();
      const back = seen && !this.seenBefore;
      this.seenBefore = seen;
      if (!(
        seen &&
        failed &&
        !failed.ok &&
        failed.origin === this.paneOrigin
      )) {
        return;
      }
      if (back) {
        untrack(() => {
          this.probe += 1;
        });
        return;
      }
      const timer = setTimeout(
        () => {
          this.probe += 1;
        },
        Math.min(PROBE_FIRST_MS * 2 ** (failed.tries - 1), PROBE_MOST_MS)
      );
      return () => clearTimeout(timer);
    });
  }

  /** `at` is the page's own place on its origin (the overlay's `url`). */
  keepAt(at: URL): void {
    const place = `${at.pathname}${at.search}${at.hash}`;
    if (!(this.paneOrigin && this.#deps.paneSubject.preview)) {
      return;
    }
    writeJson(this.keepKey, {
      revision: this.#deps.paneSubject.preview.revision,
      at: place,
    });
  }

  /** Why this tab can't load a frame of `origin` yet, or null once it reached it and entered its previews. */
  async unreachedWords(origin: string): Promise<string | null> {
    // The preview's own server down is the origin reached (core
    // `unreachedOf`): its load gets the proxy's page naming the hop
    // (`heardDown`), so the pane draws that hop's down state and tells the
    // hub (`artifactShown`).
    const failed = unreachedOf(await probePreview(origin, hubReach));
    if (failed) {
      return previewUnreachedWords(
        new URL(origin).host,
        failed,
        await this.previewsNeed(origin)
      );
    }
    const refused = await enterPreviews(origin);
    return refused && `The hub didn't give this preview a pass: ${refused}`;
  }

  async previewsNeed(origin: string): Promise<string> {
    if (this.byHost) {
      return previewsNeedWords({ byHost: true, host: new URL(origin).host });
    }
    this.portsRead ??= hubData(hub.api["preview-settings"].get()).catch(
      () => null
    );
    const settings = await this.portsRead;
    return previewsNeedWords({
      byHost: false,
      hostname: location.hostname,
      ports: settings?.ports ?? null,
      hostMode: settings?.mode === "host",
    });
  }
}
