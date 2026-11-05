<script lang="ts" module>
  import type { Component } from "svelte";

  /** The bar's one prominent action, trailing. */
  export interface BarAction {
    /** Said in words beside its glyph at every width, or the glyph alone on a phone. */
    compact?: boolean;
    icon: Component;
    label: string;
  }

  /** What opens over (or beside) the page. */
  export type PaneForm = "over" | "dock" | "sheet";
</script>

<script lang="ts">
  /**
   * One screen of the project, whole, as the person sees it at the frame's
   * width: the shell's rail (a stand-in, unchanged by this option), the
   * place's bar, the page, and what is open over it.
   *
   * The bar follows Liquid Glass (DESIGN.md, The Title Bars Follow Liquid
   * Glass Rule): one row with no ground; leading, Back to Home in a place
   * (the burger for the projects sheet on Home under the desk line); the
   * place's short title; trailing, a glass group of bare symbols (More),
   * then the one prominent action.
   *
   * A pane: `over` slides over the page's right third at 900 and up, the
   * page live beneath it; `dock` stands beside the page at 1024 and up and
   * over it from 900; `sheet` is the Configure sheet from the trailing
   * edge. Under 900 every pane is a bottom drawer at 85% of the screen over
   * the scrim. A frame with a pane open is one screen tall, the page cut at
   * its foot; without one, as tall as its page.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import type { Snippet } from "svelte";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArrowLeft,
    IconClose,
    IconFolder,
    IconMore,
    IconSidebar,
  } from "#lib/icons.js";

  let {
    project,
    title,
    home = false,
    action,
    more = [],
    moreOpen = false,
    pane,
    paneForm = "over",
    paneTitle,
    paneClose = words.taskPane.close,
    children,
    onback,
    onaction,
    onclosepane,
  }: {
    project: string;
    /** The place's short name; Home's bar carries the project's. */
    title: string;
    /** This is Home: no Back, the burger under the desk line. */
    home?: boolean;
    action?: BarAction;
    /** More's items, the rare acts. */
    more?: string[];
    /** More stands open. */
    moreOpen?: boolean;
    /** What is open over the page. */
    pane?: Snippet;
    paneForm?: PaneForm;
    /** The pane's head's title, where it has one. */
    paneTitle?: string;
    /** Its Close, named by what it closes. */
    paneClose?: string;
    children: Snippet;
    onback?: () => void;
    onaction?: () => void;
    onclosepane?: () => void;
  } = $props();

  const head = sheetHeadVariants();
  const paneOpen = $derived(pane !== undefined);
</script>

<TooltipProvider>
  <div class="@container/shell w-full text-ink-strong">
    <div
      class={[
        "relative flex w-full bg-surface-recess",
        "aspect-390/844 @min-desk/shell:@max-wide/shell:aspect-3/4 @min-wide/shell:aspect-16/10",
        paneOpen && "overflow-clip",
      ]}
      data-pane={paneOpen ? paneForm : undefined}
    >
      <!-- The shell's rail, as it stands today with this project chosen: a
           stand-in, unchanged by this option (the structure canvas's
           "Shell rail"). Under the desk line it is the burger's sheet. -->
      <nav
        class="hidden w-c-sidebar-w flex-none flex-col gap-space-1 border-e border-e-border-hairline bg-surface-recess px-space-3 pt-space-3 @min-desk/shell:flex"
        aria-label={words.bar.projects}
      >
        <p
          class="m-0 flex h-c-top-bar-h items-center ps-space-2 type-meta text-ink-muted"
        >
          {words.bar.projects}
        </p>
        {#each ["Cawco", "Cawco-Dev"] as name (name)}
          <a
            aria-current={name === project ? "page" : undefined}
            class="mark-line press-tint flex h-c-btn-h items-center gap-space-2 rounded-sm px-space-2 type-label text-ink-row transition-control not-aria-current-page:hover:bg-surface-hover aria-current-page:bg-selected-bg aria-current-page:text-selected-ink"
            href={`#${name}`}
          >
            <IconFolder
              aria-hidden="true"
              class="size-icon-md text-ink-muted"
            />
            <span>{name}</span>
          </a>
        {/each}
      </nav>

      <div class="relative flex min-w-0 flex-1">
        <div class="relative flex min-w-0 flex-1 flex-col">
          <header
            class="flex h-c-top-bar-h flex-none items-center gap-space-2 ps-space-6 pe-space-5 @max-desk/shell:ps-c-bar-phone-edge @max-desk/shell:pe-c-bar-phone-edge"
          >
            {#if !home}
              <BarGlass form="group">
                <Tip label={words.bar.backHome}>
                  {#snippet children(tip)}
                    <button
                      {...tip}
                      aria-label={words.bar.backHome}
                      class="select-none touch-hit press-tint"
                      data-bar-item
                      onclick={onback}
                      type="button"
                    >
                      <IconArrowLeft
                        aria-hidden="true"
                        data-slot="bar-symbol"
                      />
                    </button>
                  {/snippet}
                </Tip>
              </BarGlass>
            {:else}
              <div class="@min-desk/shell:hidden">
                <BarGlass form="group">
                  <Tip label={words.bar.projects}>
                    {#snippet children(tip)}
                      <button
                        {...tip}
                        aria-label={words.bar.projects}
                        class="select-none touch-hit press-tint"
                        data-bar-item
                        type="button"
                      >
                        <IconSidebar
                          aria-hidden="true"
                          data-slot="bar-symbol"
                        />
                      </button>
                    {/snippet}
                  </Tip>
                </BarGlass>
              </div>
            {/if}
            <h1 class="m-0 min-w-0 truncate type-title text-ink-strong">
              {title}
            </h1>
            <div class="ms-auto flex flex-none items-center gap-space-3">
              {#if more.length > 0}
                <BarGlass form="group">
                  <DropdownMenu.Root open={moreOpen}>
                    <DropdownMenu.Trigger>
                      {#snippet child({ props })}
                        <button
                          {...props}
                          aria-label={words.bar.more}
                          class="select-none touch-hit press-tint"
                          data-bar-item
                          title={words.bar.more}
                          type="button"
                        >
                          <IconMore aria-hidden="true" data-slot="bar-symbol" />
                        </button>
                      {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" width="wide">
                      {#each more as item (item)}
                        <DropdownMenu.Item>{item}</DropdownMenu.Item>
                      {/each}
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </BarGlass>
              {/if}
              {#if action}
                <Button data-icon="inline-start" onclick={onaction}>
                  <action.icon aria-hidden="true" />
                  <span
                    class={action.compact
                      ? "@max-phone/shell:sr-only"
                      : undefined}>{action.label}</span
                  >
                </Button>
              {/if}
            </div>
          </header>

          <main
            class="flex min-w-0 flex-1 flex-col ps-space-7 pe-space-6 pt-space-2 pb-space-8 @max-desk/shell:px-space-4"
          >
            {@render children()}
          </main>

          {#if pane && paneForm !== "dock"}
            <!-- Under the desk line, the page dims under the scrim. -->
            <div
              aria-hidden="true"
              class={[
                scrimVariants(),
                "absolute inset-0 @min-desk/shell:hidden",
              ]}
            ></div>
          {/if}
          {#if pane && paneForm === "over"}
            {@render paneBox("third")}
          {/if}
        </div>
        {#if pane && paneForm === "dock"}
          <div
            aria-hidden="true"
            class={[scrimVariants(), "absolute inset-0 @min-desk/shell:hidden"]}
          ></div>
          {@render paneBox("dock")}
        {/if}
      </div>
      {#if pane && paneForm === "sheet"}
        {@render paneBox("sheet")}
      {/if}
    </div>
  </div>
</TooltipProvider>

{#snippet paneBox(form: "third" | "dock" | "sheet")}
  <aside
    class={[
      "absolute inset-x-0 bottom-0 z-1 flex h-5/6 flex-col rounded-t-lg bg-surface-raised shadow-drawer transition-[translate] duration-(--dur-panel) ease-drawer starting:translate-y-full",
      form === "dock"
        ? "@min-desk/shell:w-c-panel-w @min-desk/shell:@max-wide/shell:inset-x-auto @min-desk/shell:@max-wide/shell:top-0 @min-desk/shell:@max-wide/shell:end-0 @min-desk/shell:@max-wide/shell:h-auto @min-desk/shell:@max-wide/shell:rounded-t-none @min-desk/shell:@max-wide/shell:rounded-s-panel @min-desk/shell:@max-wide/shell:border-s @min-desk/shell:@max-wide/shell:border-s-border-hairline @min-desk/shell:@max-wide/shell:starting:translate-x-full @min-desk/shell:@max-wide/shell:starting:translate-y-0 @min-wide/shell:static @min-wide/shell:h-auto @min-wide/shell:flex-none @min-wide/shell:rounded-none @min-wide/shell:border-s @min-wide/shell:border-s-border-hairline @min-wide/shell:shadow-none @min-wide/shell:starting:translate-y-0"
        : "@min-desk/shell:inset-x-auto @min-desk/shell:top-0 @min-desk/shell:end-0 @min-desk/shell:h-auto @min-desk/shell:rounded-t-none @min-desk/shell:rounded-s-panel @min-desk/shell:border-s @min-desk/shell:border-s-border-hairline @min-desk/shell:starting:translate-x-full @min-desk/shell:starting:translate-y-0",
      form === "third" && "@min-desk/shell:w-1/3",
      form === "sheet" && "@min-desk/shell:w-c-panel-w",
    ]}
    aria-label={paneTitle}
    data-pane-box={form}
  >
    <span
      aria-hidden="true"
      class={[grabberVariants(), "@min-desk/shell:hidden"]}
    ></span>
    <div
      class={[head.head(), "px-space-5 pt-space-1 @min-desk/shell:pt-space-4"]}
    >
      <h2 class={[head.title(), "m-0"]}>{paneTitle}</h2>
      <Tip label={paneClose}>
        {#snippet children(tip)}
          <button
            {...tip}
            aria-label={paneClose}
            class={head.close()}
            onclick={onclosepane}
            type="button"
          >
            <IconClose aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
    </div>
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto px-space-5 pb-space-5"
    >
      {@render pane?.()}
    </div>
  </aside>
{/snippet}
