/**
 * What the pane is showing: its session's panel, the artifact in it, and who owns it.
 */
import { machineLabel } from "@cawco/core/machine-names";
import { resolveSessionTitle } from "../links";
import { paneFleet } from "./pane-fleet";

export interface PaneSubjectDeps {
  readonly instanceId: () => string;
  readonly ownTab: () => boolean;
}
export class PaneSubject {
  readonly #deps: PaneSubjectDeps;

  /** The session's panel, row and machines, from whichever store this tree set (pane-fleet.ts). */
  readonly fleet = paneFleet();

  readonly preview = $derived.by(() =>
    this.fleet.preview(this.#deps.instanceId())
  );

  readonly source = $derived(this.preview?.source);

  readonly artifact = $derived(this.preview?.artifact);

  readonly owner = $derived.by(() =>
    this.fleet.session(this.#deps.instanceId())
  );

  readonly ownerMachine = $derived.by(() => {
    const machine = this.fleet.machines.find(
      (one) => one.machineId === this.owner?.machineId
    );
    return machine ? machineLabel(machine.hostname) : "its machine";
  });

  readonly ownerName = $derived(
    this.owner
      ? resolveSessionTitle({
          title: this.owner.title,
          cwd: this.owner.cwd,
          id: this.owner.id,
        })
      : "the session"
  );

  readonly downPort = $derived(
    this.source && "port" in this.source ? this.source.port : null
  );

  /** Open its session, beside Try again, wherever this pane is not that session's own. */
  readonly offerSession = $derived.by(
    () => !!this.owner && this.#deps.ownTab()
  );

  /*
   * A sheet's stage (live components): the project's own dev toolchain
   * (Vite, Astro or Nuxt), which the
   * daemon runs in its workspace; or a workspace preview's server, the
   * command it names (`serve`), run the same way. Its state is in the doc:
   * starting, waking (from sleep) and a sheet's page compiling stand on the
   * loading cover; a sheet's compile errors on a card over the last render,
   * dimmed; a stage that didn't start or stopped, where the page would be.
   */
  readonly served = $derived(
    this.source && "port" in this.source && this.source.serve
      ? this.source
      : null
  );

  readonly isSheet = $derived(this.artifact?.kind === "component");

  /**
   * A page or a sheet draws in the dashboard's theme (the overlay's
   * `themed`): its frame's `color-scheme` is that theme too, so a page that
   * styles dark by `prefers-color-scheme` hears it. A preview is its own app.
   */
  readonly themedFrame = $derived(
    this.artifact?.kind === "page" || this.isSheet
  );

  readonly artifactId = $derived(this.artifact?.id);

  /*
   * A canvas stands on its stage (canvas/stage.svelte.ts), one iframe for it
   * wherever it is: the well holds a slot the stage stands over, so Dock and
   * Undock fly that same iframe between the composer and here.
   */
  readonly isCanvas = $derived(this.artifact?.kind === "canvas");

  /*
   * A browser (Projects spec §5.11, "The view") is its stream in the well
   * (BrowserView), its head's own control Take over, or Hand back while the
   * person holds it. It has no modes, comments or ink: what the person sees
   * there reaches no agent.
   */
  readonly isBrowser = $derived(this.artifact?.kind === "browser");
  constructor(deps: PaneSubjectDeps) {
    this.#deps = deps;
  }
}
