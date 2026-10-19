<script lang="ts">
  /**
   * The WYSIWYG editor behind every markdown card. Milkdown's Crepe: you edit
   * the rendered document — headings look like headings, bold is bold, code
   * blocks are code blocks — and markdown is what comes back out, because
   * markdown is Crepe's own document format rather than an export target.
   *
   * `value` stays a plain markdown string, so everything upstream (dirty
   * tracking, the save contract, the conflict diff) is unchanged.
   *
   * Crepe reaches for `document` when it is constructed, so it is imported
   * inside `onMount`: this editor never runs on the server.
   */
  import { onMount } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // Structure only, and only for the features Crepe runs by default (top-bar,
  // ai and the ai diff stay off, so their sheets are not shipped). Crepe's own
  // theme files are nothing but a palette, and the palette this app already
  // has is the one in theme.css (the `crepe-host` component, anchored under
  // `data-slot="crepe-host"`) — so none is imported, and there is no second
  // light/dark theme to keep in step with the first.
  import "@milkdown/crepe/theme/common/prosemirror.css";
  import "@milkdown/crepe/theme/common/reset.css";
  import "@milkdown/crepe/theme/common/block-edit.css";
  import "@milkdown/crepe/theme/common/code-mirror.css";
  import "@milkdown/crepe/theme/common/cursor.css";
  import "@milkdown/crepe/theme/common/image-block.css";
  import "@milkdown/crepe/theme/common/link-tooltip.css";
  import "@milkdown/crepe/theme/common/list-item.css";
  import "@milkdown/crepe/theme/common/placeholder.css";
  import "@milkdown/crepe/theme/common/toolbar.css";
  import "@milkdown/crepe/theme/common/table.css";
  import "@milkdown/crepe/theme/common/latex.css";

  let {
    value = $bindable(),
    label,
    onready,
  }: {
    /** The markdown. Bound both ways: typing in the editor writes it back. */
    value: string;
    label?: string;
    /** Called once the editor has drawn the document and keeps still, or failed to load. */
    onready?: () => void;
  } = $props();

  let host = $state<HTMLElement | null>(null);

  /** Resolves once `node` has not changed size for 150ms. */
  const still = (node: HTMLElement) =>
    new Promise<void>((resolve) => {
      let timer = setTimeout(done, 150);
      const sizes = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(done, 150);
      });
      sizes.observe(node);
      function done() {
        sizes.disconnect();
        resolve();
      }
    });
  let failed = $state<string | null>(null);
  let editor: { destroy: () => Promise<unknown> } | null = null;
  let dropped = false;

  /** Makes the editor over `host`; a failure says why, with a retry. */
  const load = async () => {
    failed = null;
    try {
      const { Crepe } = await import("@milkdown/crepe");
      if (dropped || !host) {
        return;
      }
      // A retry starts from an empty host: a create that failed part way
      // may have left some of itself there.
      host.replaceChildren();
      const instance = new Crepe({ defaultValue: value, root: host });
      // Only a real edit writes back. Crepe does not fire this for its
      // initial parse, so opening a card and closing it again leaves
      // `value` exactly as it was read and Save stays correctly disabled.
      instance.on((api) => {
        api.markdownUpdated((_ctx, markdown) => {
          value = markdown;
        });
      });
      await instance.create();
      if (dropped) {
        await instance.destroy();
        return;
      }
      editor = instance;
      // Crepe draws in steps after it is created (the document, then the
      // blocks inside it), so "drawn" is the host keeping still.
      await still(host);
      onready?.();
    } catch (caught) {
      failed = failureWords(caught);
      onready?.();
    }
  };

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: load owns its failure, which it shows
    void load();
    return () => {
      dropped = true;
      editor?.destroy();
    };
  });
</script>

<!-- A failure fades up in place (--dur-control), with a retry. -->
{#if failed}
  <div
    data-slot="failed"
    class="flex flex-wrap items-center gap-space-3 py-space-3 px-space-7 type-label text-status-fail-ink"
    role="alert"
    in:crossIn
  >
    <p>The editor did not load: {failed}</p>
    <Button onclick={load} size="sm" variant="outline">Retry</Button>
  </div>
{/if}
<section
  aria-label={label}
  data-slot="crepe-host"
  class="min-h-full"
  bind:this={host}
  {@attach morph()}
></section>

