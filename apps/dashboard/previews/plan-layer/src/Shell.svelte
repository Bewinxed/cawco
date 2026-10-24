<script lang="ts">
  /**
   * The preview's own page: the three variants, the two widths and the two
   * schemes as option chips, and the pane drawn at its real size in a frame
   * (stage.html, its own viewport, so the app's width rules hold in it),
   * scaled down only where the window is narrower than the frame. The
   * choice is kept in the address (`?v=2&w=phone&theme=dark`).
   */
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";

  const VARIANTS = [
    {
      key: "1",
      name: "Where it stands now",
      line: "Finished steps fold into one row that opens in place; the step under way and the one waiting on you stand open, then the rest. Opens at the step under way.",
    },
    {
      key: "2",
      name: "Every step, in order",
      line: "The list as built, Waiting on you a chip on its step that opens the card. Opens at the step under way.",
    },
    {
      key: "3",
      name: "What waits on you, then the rest",
      line: "A Waiting on you group first, then the step under way, then every other step in order. Opens at the top.",
    },
  ] as const;
  const WIDTHS = {
    desk: { name: "Desk 1440", width: 1440, height: 900 },
    phone: { name: "Phone 390", width: 390, height: 844 },
  } as const;
  type Width = keyof typeof WIDTHS;

  const asked = new URLSearchParams(location.search);
  let variant = $state<string>(
    VARIANTS.some((one) => one.key === asked.get("v"))
      ? (asked.get("v") as string)
      : "1"
  );
  let width = $state<Width>(asked.get("w") === "phone" ? "phone" : "desk");
  let theme = $state<"light" | "dark">(
    (asked.get("theme") ??
      (document.documentElement.classList.contains("dark")
        ? "dark"
        : "light")) === "dark"
      ? "dark"
      : "light"
  );

  $effect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    const next = new URLSearchParams({ v: variant, w: width, theme });
    history.replaceState(null, "", `?${next}`);
  });

  const frame = $derived(WIDTHS[width]);
  const src = $derived(`./stage.html?v=${variant}&theme=${theme}`);
  const chosen = $derived(
    VARIANTS.find((one) => one.key === variant) ?? VARIANTS[0]
  );

  let room = $state(0);
  const scale = $derived(room > 0 ? Math.min(1, room / frame.width) : 1);
</script>

<main
  class="min-h-dvh bg-surface-page text-ink-strong flex flex-col gap-space-4 p-space-4"
>
  <header class="flex flex-col gap-space-3 max-w-c-measure">
    <h1 class="m-0 type-title text-ink-strong">
      When the plan opens over the conversation, what comes first?
    </h1>
    <fieldset class="m-0 p-0 border-0 min-w-0">
      <legend class="sr-only">Variant</legend>
      <div class={chipsVariants()}>
        {#each VARIANTS as one (one.key)}
          <button
            aria-pressed={variant === one.key}
            class={chipVariants({ variant: "option" })}
            onclick={() => {
              variant = one.key;
            }}
            type="button"
            ><span class="num text-ink-muted">{one.key}</span>{one.name}</button
          >
        {/each}
      </div>
    </fieldset>
    <p class="m-0 type-body text-ink-muted" data-slot="line">{chosen.line}</p>
    <div class="flex flex-wrap gap-space-4">
      <fieldset class="m-0 p-0 border-0 min-w-0">
        <legend class="sr-only">Width</legend>
        <div class={chipsVariants()}>
          {#each Object.entries(WIDTHS) as [key, one] (key)}
            <button
              aria-pressed={width === key}
              class={chipVariants({ variant: "option" })}
              onclick={() => {
                width = key as Width;
              }}
              type="button">{one.name}</button
            >
          {/each}
        </div>
      </fieldset>
      <fieldset class="m-0 p-0 border-0 min-w-0">
        <legend class="sr-only">Scheme</legend>
        <div class={chipsVariants()}>
          {#each ["light", "dark"] as const as one (one)}
            <button
              aria-pressed={theme === one}
              class={chipVariants({ variant: "option" })}
              onclick={() => {
                theme = one;
              }}
              type="button">{one === "light" ? "Light" : "Dark"}</button
            >
          {/each}
        </div>
      </fieldset>
    </div>
  </header>
  <div bind:clientWidth={room} class="min-w-0" data-slot="room">
    <div
      class="relative overflow-clip rounded-lg border border-border-hairline"
      data-slot="frame"
      style:inline-size="{frame.width * scale + 2}px"
      style:block-size="{frame.height * scale + 2}px"
    >
      {#key `${src}|${width}`}
        <iframe
          class="absolute top-0 start-0 border-0 origin-top-left"
          height={frame.height}
          {src}
          style:scale
          title="{chosen.name}, {frame.name}"
          width={frame.width}
        ></iframe>
      {/key}
    </div>
  </div>
</main>
