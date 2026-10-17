<script lang="ts">
  /**
   * The usage popover (the relay) on a bench: the real strip and its real
   * popover (the rail's, on the desk) or sheet (on the phone), fed a staged
   * forecast with no hub. `?theme=` light | dark, `?n=` 6 | 20 the number
   * of Claude accounts, `?view=` desktop | phone where it opens; on a desk
   * the phone view is this page at
   * 390×844 in a frame. Six: five accounts in Petralab (a group) and one in
   * Omar Al Matar (ungrouped); twenty adds Northwind's four (a group) and
   * Acme's two (ungrouped) (`stage.ts`); `?stop=1` stops the relay inside the
   * five hours, `?stop=2` puts every account at its limit. The picker stops its pointerdowns so a press on
   * it never reads as a press outside the popover.
   */
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import UsageMeter from "#lib/cawco/UsageMeter.svelte";
  import { usage } from "#lib/cawco/usage/forecast.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";
  import { stageUsage } from "./stage";

  const count = $derived(page.url.searchParams.get("n") === "20" ? 20 : 6);
  const view = $derived(
    page.url.searchParams.get("view") === "phone" ? "phone" : "desktop"
  );
  /** This page drawn inside the desk's phone frame. */
  const framed = $derived(page.url.searchParams.get("frame") === "1");
  const narrow = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );

  $effect(() => {
    stageUsage(count, page.url.searchParams.get("stop"));
  });

  const scheme = $derived(
    page.url.searchParams.get("theme") === "dark" ? "dark" : "light"
  );
  $effect(() => {
    theme.set(scheme);
  });

  const hrefOf = (key: string, value: string) => {
    const query = new URLSearchParams(page.url.search);
    query.set(key, value);
    query.delete("frame");
    return `?${query}`;
  };
  const frameSrc = $derived.by(() => {
    const query = new URLSearchParams(page.url.search);
    query.set("frame", "1");
    return `?${query}`;
  });

  /** The strip on screen: the bench's own on a phone, else the rail's. */
  const ownStrip = $derived(narrow.current);
  const phoneFrame = $derived(!narrow.current && view === "phone");

  /**
   * Opens the strip's popover or sheet, once it has drawn, as a press of the
   * pointer does (a pointerdown, then the click): the strip opens a pointer's
   * press with no focus ring, as it does for a person.
   */
  function openStrip() {
    const scope = ownStrip
      ? document.querySelector("[data-bench-strip]")
      : document;
    const hit = scope?.querySelector<HTMLElement>(
      ".strip-hit:not([data-state='open']):not([aria-expanded='true'])"
    );
    hit?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    hit?.click();
  }
  onMount(() => {
    let frame = 0;
    const timer = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (!phoneFrame) {
          openStrip();
        }
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      usage.stage(null);
    };
  });

  const SWITCHES = [
    {
      key: "theme",
      label: "Theme",
      options: [
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
    },
    {
      key: "n",
      label: "Accounts",
      options: [
        { value: "6", label: "6" },
        { value: "20", label: "20" },
      ],
    },
    {
      key: "view",
      label: "View",
      options: [
        { value: "desktop", label: "Desktop popover" },
        { value: "phone", label: "Phone sheet" },
      ],
    },
  ] as const;
  const current = (key: string): string =>
    ({ n: String(count), view, theme: scheme })[key] ?? "";
</script>

<svelte:head><title>Usage relay | CawCo</title></svelte:head>

{#if !framed}
  <nav
    aria-label="Usage popover bench"
    class="pointer-events-auto fixed inset-x-space-2 top-space-2 z-60 flex flex-wrap justify-end gap-x-space-4 gap-y-space-2"
    onpointerdown={(event) => event.stopPropagation()}
  >
    {#each SWITCHES as each (each.key)}
      <span class="flex items-center gap-space-1">
        <span class="type-meta text-ink-muted">{each.label}</span>
        {#each each.options as option (option.value)}
          <Button
            aria-current={current(each.key) === option.value
              ? "page"
              : undefined}
            href={hrefOf(each.key, option.value)}
            size="xs"
            variant={current(each.key) === option.value ? "default" : "outline"}
            >{option.label}</Button
          >
        {/each}
      </span>
    {/each}
    <Button onclick={openStrip} size="xs" variant="outline">Open</Button>
  </nav>
{/if}

{#if phoneFrame}
  <!-- literal: 56px -->
  <div
    class="grid place-items-center px-space-4 pt-(--pad-top) pb-space-4"
    style:--pad-top="56px"
  >
    <iframe
      class="rounded-lg border border-border-control bg-surface-recess"
      height="844"
      src={frameSrc}
      title="Phone sheet"
      width="390"
    ></iframe>
  </div>
{:else if ownStrip}
  <!-- literal: 96px, 12px -->
  <div
    class="px-(--pad-x) pt-(--pad-top)"
    data-bench-strip
    style:--pad-top="96px"
    style:--pad-x="12px"
  >
    <UsageMeter variant="home" />
  </div>
{/if}
