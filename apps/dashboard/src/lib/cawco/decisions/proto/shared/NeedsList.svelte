<script lang="ts" module>
  /** One decision waiting in the fleet: its question, two answers, how long it has waited, whether work stops behind it. */
  interface Ask {
    answers: [string, string];
    blocks: boolean;
    id: string;
    q: string;
    /** Minutes waited. */
    waited: number;
  }

  interface Asker {
    asks: Ask[];
    id: string;
    machine: { name: string; os: string; offline?: boolean };
    title: string;
  }

  /** The machine most work runs on: named only when it's news. */
  const HOME = "obelisk-of-light";

  /** The fleet's open decisions as one afternoon left them. */
  const FLEET: Asker[] = [
    {
      id: "12583348",
      title: "Run the ready CawCo tasks",
      machine: { name: HOME, os: "linux-x64" },
      asks: [
        {
          id: "bar",
          q: "Which steps bar moves you through a component's states?",
          answers: ["Dessn's field", "Apple Books' scrubber"],
          waited: 134,
          blocks: true,
        },
        {
          id: "ship",
          q: "Ship the vanishing-question fix now, or with Who decides?",
          answers: ["Ship it now", "With Who decides"],
          waited: 41,
          blocks: false,
        },
      ],
    },
    {
      id: "e9e35d8c",
      title: "Add Stremio poster picker overlay",
      machine: { name: "Omars-MacBook-Pro", os: "darwin-arm64", offline: true },
      asks: [
        {
          id: "posters",
          q: "Posters in a grid, or one row you swipe?",
          answers: ["A grid", "One row"],
          waited: 96,
          blocks: true,
        },
      ],
    },
    {
      id: "fcc6da91",
      title: "Design three judging-surface structures",
      machine: { name: HOME, os: "linux-x64" },
      asks: [
        {
          id: "shot",
          q: "Does a verdict carry its own screenshot?",
          answers: ["With it", "Without"],
          waited: 63,
          blocks: true,
        },
        {
          id: "reviewer",
          q: "Name the reviewer on every verdict, or only when it isn't Caw?",
          answers: ["Every verdict", "Only when it isn't Caw"],
          waited: 7,
          blocks: false,
        },
      ],
    },
    {
      id: "16f674b9",
      title: "Build image settings control (arm A)",
      machine: { name: HOME, os: "linux-x64" },
      asks: [
        {
          id: "settings",
          q: "Which image settings stay in view?",
          answers: ["Size and quality", "All five"],
          waited: 18,
          blocks: true,
        },
      ],
    },
    {
      id: "6225a746",
      title: "Audit Stremio addons and self-hosting",
      machine: { name: "uwucloud", os: "linux-x64" },
      asks: [
        {
          id: "host",
          q: "Self-host the addons on uwucloud, or keep the public ones?",
          answers: ["Self-host", "Keep the public ones"],
          waited: 12,
          blocks: false,
        },
      ],
    },
  ];

  const waitWords = (minutes: number): string =>
    minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
</script>

<script lang="ts">
  import OsMark from "#lib/cawco/OsMark.svelte";
  /**
   * The fleet's decisions list, drawn live with the look a decision page's
   * answers set (request.ts `ListLook`): the demonstration every answer of
   * the prototypes' request shows. It lays itself out to its frame by
   * container queries, so a 390 frame draws the phone and a 1440 frame the
   * desk whatever window holds it. Answer, Next, Back, Undo and the layout
   * switch all work.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconChevronLeft, IconPause } from "#lib/icons.js";
  import type { ListLook } from "./request";

  let { look }: { look: ListLook } = $props();

  let answered = $state<Record<string, string>>({});
  let view = $state<"work" | "deck">("work");
  /** The decision open: on a phone null is the list. */
  let opened = $state<string | null | undefined>(undefined);

  const rank = (ask: Ask) =>
    look.order === "longest" ? -ask.waited : ask.waited;

  const groups = $derived(
    FLEET.map((asker) => ({
      ...asker,
      asks: asker.asks
        .filter((ask) => look.answered === "undo" || !answered[ask.id])
        .toSorted((a, b) => rank(a) - rank(b)),
    }))
      .filter((asker) => asker.asks.length > 0)
      .toSorted((a, b) => rank(a.asks[0]) - rank(b.asks[0]))
  );

  const flat = $derived(
    FLEET.flatMap((asker) =>
      asker.asks.map((ask) => ({ asker, ask }))
    ).toSorted((a, b) => rank(a.ask) - rank(b.ask))
  );
  const waiting = $derived(flat.filter((one) => !answered[one.ask.id]));

  /** Where the phone opens: the most urgent decision with Deck's entry, else the list. */
  const first = $derived(
    look.entry === "urgent" ? (waiting[0]?.ask.id ?? null) : null
  );
  const openId = $derived(opened === undefined ? first : opened);
  const current = $derived(flat.find((one) => one.ask.id === openId) ?? null);
  /** The desk always shows a decision beside the list. */
  const shown = $derived(current ?? waiting[0] ?? null);

  const named = (machine: Asker["machine"]) =>
    look.machine === "every" || machine.offline || machine.name !== HOME;

  function nextOf(id: string | null): string | null {
    const left = waiting.filter((one) => one.ask.id !== id);
    if (look.next === "session" && id) {
      const here = flat.find((one) => one.ask.id === id)?.asker.id;
      const same = left.find((one) => one.asker.id === here);
      if (same) {
        return same.ask.id;
      }
    }
    return left[0]?.ask.id ?? null;
  }

  function answer(id: string, words: string) {
    answered = { ...answered, [id]: words };
    opened = nextOf(id);
  }

  function undo(id: string) {
    const { [id]: _, ...rest } = answered;
    answered = rest;
  }
</script>

{#snippet wait(ask: Ask)}
  <span
    class="flex flex-none items-center gap-space-1 text-ink-muted mark-line"
  >
    {#if ask.blocks}
      <IconPause class="size-icon-sm" aria-label="Blocks work" />
    {/if}
    <span class="type-meta tabular-nums">{waitWords(ask.waited)}</span>
  </span>
{/snippet}

{#snippet place(asker: Asker)}
  {#if named(asker.machine)}
    <span
      class="flex min-w-0 items-center gap-space-1 text-ink-muted mark-line"
    >
      <OsMark os={asker.machine.os} class="size-icon-sm flex-none" />
      <span
        class="type-meta min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >
        {asker.machine.name}{asker.machine.offline ? " · offline" : ""}
      </span>
    </span>
  {/if}
{/snippet}

{#snippet askRow(asker: Asker, ask: Ask, folded: boolean)}
  {@const done = answered[ask.id]}
  <!-- mark-line: a folded row's mark stands at the top of its two lines -->
  <li
    class={[
      "flex min-h-c-row-h gap-space-3 rounded-sm px-space-2 data-open:bg-surface-hover",
      folded ? "items-start py-space-2" : "items-center ps-space-5",
    ]}
    data-open={shown?.ask.id === ask.id || undefined}
  >
    {#if folded}
      <span class="grid w-c-row-lead flex-none place-items-center pt-space-1">
        <SessionMark id={asker.id} place={asker.machine.name} status="attn" />
      </span>
    {/if}
    {#if done}
      <div class="flex min-w-0 flex-1 flex-col gap-space-1 py-space-2">
        <span class="type-body text-ink-subtle line-through">{ask.q}</span>
        <span class="type-meta text-ink-muted">Answered: {done}</span>
      </div>
      <Button size="xs" variant="ghost" onclick={() => undo(ask.id)}>
        <span>Undo</span>
      </Button>
    {:else}
      <button
        class="focus-inset flex min-w-0 flex-1 flex-col gap-space-1 rounded-sm py-space-2 text-start"
        type="button"
        onclick={() => {
          opened = ask.id;
        }}
      >
        <span class="type-body text-ink-strong">{ask.q}</span>
        {#if folded}
          <span class="flex min-w-0 flex-wrap items-center gap-x-space-2">
            <span class="type-meta text-ink-muted">{asker.title}</span>
            {@render place(asker)}
          </span>
        {/if}
      </button>
      {@render wait(ask)}
    {/if}
  </li>
{/snippet}

{#snippet list()}
  <div class="flex flex-col gap-space-3 px-space-3 pt-space-2 pb-space-5">
    {#if look.layouts === "two"}
      <ToggleGroup.Root
        type="single"
        value={view}
        onValueChange={(next) => {
          if (next) {
            view = next as "work" | "deck";
          }
        }}
        aria-label="Layout"
      >
        <ToggleGroup.Item value="work">By work</ToggleGroup.Item>
        <ToggleGroup.Item value="deck">Deck</ToggleGroup.Item>
      </ToggleGroup.Root>
    {/if}
    {#if look.layouts === "two" && view === "deck"}
      {#each [true, false] as blocks (blocks)}
        <section>
          <h3 class="p-space-2 type-label text-ink-muted">
            {blocks ? "Blocks work" : "Work goes on"}
          </h3>
          <ul>
            {#each flat.filter((one) => one.ask.blocks === blocks && (look.answered === "undo" || !answered[one.ask.id])) as one (one.ask.id)}
              {@render askRow(one.asker, one.ask, true)}
            {/each}
          </ul>
        </section>
      {/each}
    {:else}
      {#each groups as asker (asker.id)}
        {#if look.fold === "folded" && asker.asks.length === 1}
          <ul>{@render askRow(asker, asker.asks[0], true)}</ul>
        {:else}
          <section>
            <div
              class="flex min-h-c-row-h items-center gap-space-3 px-space-2 mark-line"
            >
              <span
                class="grid w-c-row-lead flex-none place-items-center"
                data-box
              >
                <SessionMark
                  id={asker.id}
                  place={asker.machine.name}
                  status="attn"
                />
              </span>
              <span
                class="type-label min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-row"
              >
                {asker.title}
              </span>
              {@render place(asker)}
            </div>
            <ul class="ps-c-row-lead">
              {#each asker.asks as ask (ask.id)}
                {@render askRow(asker, ask, false)}
              {/each}
            </ul>
          </section>
        {/if}
      {:else}
        <p class="p-space-4 type-body text-ink-muted">Nothing waits on you.</p>
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet decision(one: { asker: Asker; ask: Ask } | null, phone: boolean)}
  <div
    class={phone
      ? "flex flex-col"
      : "flex max-w-task-frame flex-1 flex-col self-start rounded-lg bg-surface-raised shadow-tile"}
  >
    {#if phone}
      <div class="flex h-c-top-bar-h items-center gap-space-2 px-space-3">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Back to the list"
          onclick={() => {
            opened = null;
          }}
        >
          <IconChevronLeft />
        </Button>
        <span class="type-label text-ink-strong">Needs you</span>
        <Button
          size="sm"
          variant="ghost"
          class="ms-auto"
          disabled={!(one && nextOf(one.ask.id))}
          onclick={() => {
            if (one) {
              opened = nextOf(one.ask.id);
            }
          }}
        >
          <span>Next</span>
        </Button>
      </div>
    {/if}
    {#if one}
      <div class="flex flex-col gap-space-3 p-space-4">
        <span class="flex min-w-0 items-center gap-space-2 mark-line">
          <span data-box>
            <SessionMark
              id={one.asker.id}
              place={one.asker.machine.name}
              status="attn"
            />
          </span>
          <span
            class="type-label min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-row"
          >
            {one.asker.title}
          </span>
        </span>
        <h2 class="type-title text-balance text-ink-strong">{one.ask.q}</h2>
        <span class="flex flex-wrap items-center gap-x-space-3">
          {@render wait(one.ask)}
          {@render place(one.asker)}
        </span>
        {#if answered[one.ask.id]}
          <p class="type-body text-ink-muted">
            Answered: {answered[one.ask.id]}
          </p>
        {:else}
          <div class="flex flex-wrap gap-space-2">
            {#each one.ask.answers as words (words)}
              <Button
                variant="outline"
                onclick={() => answer(one.ask.id, words)}
              >
                <span>{words}</span>
              </Button>
            {/each}
          </div>
        {/if}
        {#if !phone}
          <Button
            size="sm"
            variant="ghost"
            class="self-start"
            disabled={!nextOf(one.ask.id)}
            onclick={() => {
              opened = nextOf(one.ask.id);
            }}
          >
            <span>Next</span>
          </Button>
        {/if}
      </div>
    {:else}
      <p class="p-space-4 type-body text-ink-muted">Nothing waits on you.</p>
    {/if}
  </div>
{/snippet}

<div class="@container size-full overflow-auto bg-surface-page text-ink-strong">
  <div class="@desk:hidden">
    {#if current}
      {@render decision(current, true)}
    {:else}
      <div class="flex h-c-top-bar-h items-center gap-space-2 px-space-3">
        <span class="type-label text-ink-strong">Needs you</span>
        <span class="type-meta tabular-nums text-ink-muted"
          >{waiting.length}</span
        >
      </div>
      {@render list()}
    {/if}
  </div>
  <div class="hidden gap-space-5 px-space-6 py-space-5 @desk:flex">
    <div class="w-details flex-none">{@render list()}</div>
    {@render decision(shown, false)}
  </div>
</div>
