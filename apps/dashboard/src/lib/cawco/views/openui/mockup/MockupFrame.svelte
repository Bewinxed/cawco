<script lang="ts">
  /**
   * A mockup, drawn in its project's design (Projects spec §5.7): its
   * program over the project's mockup library (library.ts), by the one
   * OpenUI binding (OpenUiRenderer, through MockupTree).
   *
   * - **A project's own design** is drawn in a shadow root (frame-css.ts
   *   says why): the project's CSS, read for it by the hub, and the
   *   mockup's roles inside; its fonts registered with the document under
   *   names of their own, and taken away again with the frame. Nothing of
   *   the dashboard's styles reaches in, and nothing of the project's out.
   * - **A project drawn as CawCo** (`system: "cawco"`) is drawn in place,
   *   with the dashboard's own CSS and tokens: the roles are CawCo's, and
   *   its components are the dashboard's real ones.
   *
   * Every error (a part that throws, a font that does not load) is said
   * over the mockup, never dropped.
   */
  import { designFileUrl, type ProjectMockups } from "@cawco/core/mockups";
  import type { OpenUIError } from "@openuidev/lang-core";
  import { getAllContexts, mount, unmount, untrack } from "svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { theme } from "#lib/theme.svelte.js";
  import RegionHeld from "../../../RegionHeld.svelte";
  import { setMockupContext } from "./context";
  import { dashboardProperties, fontDescriptors, shadowCss } from "./frame-css";
  import { mockupLibraryOf } from "./library";
  import MockupTree from "./MockupTree.svelte";

  let {
    mockups,
    source,
    projectId,
  }: {
    /** The project's mockup library, as the hub answers it. */
    mockups: ProjectMockups;
    /** The mockup's program, checked by the hub. */
    source: string;
    projectId: string;
  } = $props();

  setMockupContext({
    template: (name) => mockups.templates[name],
    asset: (name) => {
      const asset = mockups.assets.find((each) => each.name === name);
      return asset
        ? { url: designFileUrl(projectId, asset.file), alt: asset.alt }
        : undefined;
    },
  });

  const cawco = $derived(mockups.design.system === "cawco");
  const library = $derived(mockupLibraryOf(mockups.hash, mockups.design));

  let drawErrors = $state<OpenUIError[]>([]);
  let fontErrors = $state<string[]>([]);
  const errors = $derived([
    ...drawErrors.map((error) => error.message),
    ...fontErrors,
  ]);
  const reported = (each: OpenUIError[]): void => {
    drawErrors = each;
  };

  // What the tree inside the shadow root draws: one object, read by the
  // mounted tree as its props, kept in step with this frame's.
  const tree = $state({
    source: untrack(() => source),
    library: untrack(() => library),
    onError: reported,
  });
  $effect(() => {
    tree.source = source;
    tree.library = library;
  });

  const contexts = getAllContexts();
  let host = $state<HTMLDivElement>();
  $effect(() => {
    if (cawco || !host) {
      return;
    }
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const base = document.createElement("style");
    base.textContent = shadowCss(mockups.roles, dashboardProperties());
    const own = document.createElement("style");
    own.textContent = mockups.css;
    const place = document.createElement("div");
    root.replaceChildren(base, own, place);
    const drawn = untrack(() =>
      mount(MockupTree, { target: place, props: tree, context: contexts })
    );
    return () => {
      unmount(drawn);
      root.replaceChildren();
    };
  });

  // The project's fonts, under the names the hub gave them: in the
  // document's font set while the frame stands (a shadow root's own
  // @font-face is not applied), out of it after.
  $effect(() => {
    const faces: FontFace[] = [];
    const failed: string[] = [];
    const fail = (name: string, file: string, error: unknown) => {
      failed.push(
        `The font ${name} (${file}) could not be loaded: ${error instanceof Error ? error.message : String(error)}`
      );
      fontErrors = [...failed];
    };
    for (const font of mockups.fonts) {
      try {
        const face = new FontFace(
          font.family,
          `url("${designFileUrl(projectId, font.file)}")`,
          fontDescriptors(font)
        );
        document.fonts.add(face);
        faces.push(face);
        face
          .load()
          .catch((error: unknown) => fail(font.name, font.file, error));
      } catch (error) {
        fail(font.name, font.file, error);
      }
    }
    return () => {
      for (const face of faces) {
        document.fonts.delete(face);
      }
      fontErrors = [];
    };
  });
</script>

<div
  class="mockup-frame"
  data-mockup-errors={errors.length}
  data-mockup-frame={cawco ? "cawco" : "project"}
>
  {#each errors as said (said)}
    <Alert data-mockup-error variant="warning">
      <AlertDescription>{said}</AlertDescription>
    </Alert>
  {/each}
  <svelte:boundary>
    <!-- Its error is the mockup's, never the route's (region-held.ts). -->
    <RegionHeld />
    {#if cawco}
      <div class="mk-cawco">
        <MockupTree {library} onError={reported} {source} />
      </div>
    {:else}
      <div
        bind:this={host}
        class="mk-host"
        style:color-scheme={theme.resolved}
      ></div>
    {/if}
    {#snippet failed(thrown)}
      <Alert data-mockup-error variant="warning">
        <AlertDescription
          >This mockup could not be drawn:
          {thrown instanceof Error
            ? thrown.message
            : String(thrown)}</AlertDescription
        >
      </Alert>
    {/snippet}
  </svelte:boundary>
</div>

<style>
  .mockup-frame {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .mk-host {
    display: block;
    min-inline-size: 0;
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  /* CawCo drawn as itself: the roles are the dashboard's own tokens. */
  .mk-cawco {
    --mk-canvas: var(--surface-page);
    --mk-surface: var(--surface-raised);
    --mk-sunken: var(--surface-recess);
    --mk-ink: var(--ink-strong);
    --mk-muted: var(--ink-muted);
    --mk-line: var(--border);
    --mk-accent: var(--action-solid);
    --mk-on-accent: var(--on-action);
    --mk-positive: var(--status-done-ink);
    --mk-caution: var(--status-attn-ink);
    --mk-critical: var(--status-fail-ink);
    --mk-font-body: var(--font-body);
    --mk-font-display: var(--font-display);
    --mk-text-size: var(--text-body);
    --mk-space: var(--space-1);
    --mk-radius: var(--radius-lg);
    --mk-radius-small: var(--radius-sm);
    --mk-shadow: var(--shadow-raised);
    min-inline-size: 0;
    border-radius: var(--radius-lg);
    overflow: auto;
    color: var(--ink-strong);
    font: var(--type-body);
  }
  .mk-cawco :global(.mk-root) {
    display: flex;
    flex-direction: column;
    padding: var(--space-6);
    background: var(--surface-page);
  }
</style>
