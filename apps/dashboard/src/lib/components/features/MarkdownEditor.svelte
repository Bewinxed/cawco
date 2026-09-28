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
  import { morph } from "$lib/whiffle/motion/morph.svelte";
  // Structure only, and only for the features Crepe runs by default (top-bar,
  // ai and the ai diff stay off, so their sheets are not shipped). Crepe's own
  // theme files are nothing but a palette, and the palette this app already
  // has is the one below — so none is imported, and there is no second
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

  onMount(() => {
    let editor: { destroy: () => Promise<unknown> } | null = null;
    let dropped = false;

    const load = async () => {
      try {
        const { Crepe } = await import("@milkdown/crepe");
        if (dropped || !host) {
          return;
        }
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
        failed = caught instanceof Error ? caught.message : String(caught);
        onready?.();
      }
    };
    load();

    return () => {
      dropped = true;
      editor?.destroy();
    };
  });
</script>

{#if failed}
  <p
    class="px-[var(--space-7)] py-[var(--space-3)] text-[length:var(--text-label)] text-[var(--ink-strong)]"
    role="alert"
  >
    The editor did not load: {failed}
  </p>
{/if}
<section
  aria-label={label}
  class="crepe-host"
  bind:this={host}
  {@attach morph()}
></section>

<style>
  /* Crepe's structural CSS reads these off `.milkdown` itself, so they are set
     there rather than on the host — a theme file would otherwise win by
     sitting closer to the element. Every value is an app token, so the editor
     follows light and dark with everything else. */
  .crepe-host :global(.milkdown) {
    --crepe-color-background: var(--surface-recess);
    --crepe-color-on-background: var(--ink-strong);
    --crepe-color-surface: var(--surface-raised);
    --crepe-color-surface-low: var(--surface-recess);
    --crepe-color-on-surface: var(--ink-strong);
    --crepe-color-on-surface-variant: var(--ink-muted);
    --crepe-color-outline: var(--ink-muted);
    --crepe-color-primary: var(--ink-strong);
    --crepe-color-secondary: var(--surface-hover);
    --crepe-color-on-secondary: var(--ink-strong);
    --crepe-color-inverse: var(--ink-strong);
    --crepe-color-on-inverse: var(--surface-raised);
    --crepe-color-inline-code: var(--ink-strong);
    --crepe-color-inline-area: var(--surface-recess);
    --crepe-color-error: var(--ink-strong);
    --crepe-color-hover: var(--surface-hover);
    --crepe-color-selected: var(--surface-fill);

    --crepe-base-font-size: var(--text-body);
    --crepe-font-title: var(--font-body);
    --crepe-font-default: var(--font-body);
    --crepe-font-code: var(--font-mono);

    --crepe-shadow-1: var(--shadow-tile);
    --crepe-shadow-2: var(--shadow-overlay);

    /* The card already draws the frame; the editor must not draw a second. */
    background: var(--surface-recess);
    box-shadow: none;
    padding: var(--space-1);
  }
  .crepe-host {
    min-height: 100%;
  }
  /* Crepe's common stylesheet includes theme typography and motion. Keep its
     structural selectors while enforcing the ledger contract on every widget. */
  /* Crepe's stock CSS sizes text off its own scale, and DESIGN.md admits only
     the type roles. This blanket rule is the enforcement (the body role); the
     exemptions below put the hierarchy back on the elements that carry it:
     h1 and h2 in the title role, the smaller headings and strong text at the
     body size in 500, code at the label size in the mono.
     Narrowing this to `.ProseMirror` descendants was tried and reverted: it let
     Crepe's own sizes back in on everything the exemptions did not name. */
  .crepe-host :global(.milkdown *) {
    font-weight: var(--weight-body) !important;
    font-size: var(--text-body) !important;
    line-height: var(--leading-body) !important;
  }
  .crepe-host :global(.milkdown *),
  .crepe-host :global(.milkdown *::before),
  .crepe-host :global(.milkdown *::after) {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
  .crepe-host :global(.milkdown :is(strong, b, h1, h2, h3, h4, h5, h6, th)) {
    font-weight: var(--weight-strong) !important;
  }
  .crepe-host :global(.milkdown .ProseMirror :is(h1, h2, h3, h4, h5, h6)) {
    margin-top: var(--space-5);
    padding: var(--space-1) 0;
  }
  .crepe-host :global(.milkdown .ProseMirror h1) {
    font-size: var(--text-title) !important;
  }
  .crepe-host :global(.milkdown .ProseMirror h2) {
    font-size: var(--text-title) !important;
  }
  .crepe-host :global(.milkdown .ProseMirror :is(h3, h4, h5, h6)) {
    font-size: var(--text-body) !important;
  }
  .crepe-host :global(.milkdown .ProseMirror) {
    padding: var(--space-4) calc(var(--space-6) - var(--space-1)) var(--space-6)
      calc(var(--space-7) - var(--space-1));
    overflow-wrap: anywhere;
    min-height: calc(var(--space-8) * 8);
  }
  .crepe-host :global(.milkdown .ProseMirror > :first-child) {
    margin-top: 0;
  }
  .crepe-host :global(.milkdown .ProseMirror p) {
    padding: var(--space-1) 0;
  }
  .crepe-host :global(.milkdown .ProseMirror code) {
    font-size: var(--text-label) !important;
    padding-inline: var(--space-1);
    border-radius: var(--radius-xs);
  }
  .crepe-host :global(.milkdown .ProseMirror pre) {
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
  }
  .crepe-host :global(.milkdown .ProseMirror blockquote) {
    padding-left: var(--space-6);
    margin-block: var(--space-1);
  }
  .crepe-host :global(.milkdown .ProseMirror blockquote::before) {
    width: var(--space-1);
    top: var(--space-1);
    bottom: var(--space-1);
    border-radius: var(--radius-pill);
  }
  .crepe-host :global(.milkdown .milkdown-code-block) {
    padding: var(--space-2) var(--space-3) var(--space-3);
    margin-block: var(--space-2);
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
  }
  .crepe-host :global(.milkdown :is(.cm-editor, .cm-gutters)) {
    background: var(--surface-recess);
  }
  .crepe-host :global(.milkdown :is(button, input, [role="button"])) {
    border-radius: var(--radius-sm);
    font-size: var(--text-label) !important;
    line-height: var(--leading-ui) !important;
  }
  .crepe-host :global(.milkdown button) {
    border: 1px solid var(--border-control);
    box-shadow: var(--shadow-tile);
  }
  .crepe-host :global(.milkdown :focus-visible) {
    outline: 2px solid var(--focus-ring) !important;
    outline-offset: 1px;
  }
  .crepe-host :global(.milkdown :is(button, [role="button"]):active) {
    background: var(--surface-fill);
    box-shadow: var(--shadow-inset-sel);
  }
  @media (hover: none) {
    .crepe-host :global(.milkdown) {
      --crepe-color-hover: transparent;
    }
  }
  /* Milkdown renders its own toolbar and menus, so they cannot carry
     `.touch-hit`; on a coarse pointer they keep a 44px box. Links in the
     text flow with it. */
  @media (pointer: coarse) {
    .crepe-host
      :global(
        .milkdown
          :is(
            button,
            input,
            [role="button"],
            .operation-item,
            .milkdown-slash-menu li
          )
      ) {
      min-width: 44px;
      min-height: 44px;
    }
  }
</style>
