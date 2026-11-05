<script lang="ts" module>
  /** How Caw's conversation stands as the pane opens. */
  export type CawPaneState =
    "conversation" | "fresh" | "loading" | "off" | "unreachable";
</script>

<script lang="ts">
  /**
   * Caw's pane (TOM task 5): his status in a word and his sentence, his
   * harness and model, whether the project's events reach him, and Turn
   * off; the newest conversation, or a new one; the starters written for
   * this project, which fill the composer and never send; the composer.
   * Open as its own session gives the conversation room of its own.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import cawFace from "#lib/assets/brand/cawco-icon.png";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChatAdd, IconMaximize, IconSend } from "#lib/icons.js";
  import type { Caw } from "./model";

  let {
    caw,
    state = "conversation",
    draft = "",
  }: {
    caw: Caw;
    state?: CawPaneState;
    /** What a starter put in the composer. */
    draft?: string;
  } = $props();

  const STARTERS = [
    "Plan the launch week: one post a day, Monday to Friday",
    "Why did the reply shortlist time out this morning?",
    "Draft replies for today's shortlist",
  ];
  const TURNS = [
    {
      who: "person",
      text: "Draft three posts for Thursday from what shipped this week.",
    },
    {
      who: "caw",
      text: "On it. I'm reading this week's merged changes in bewinxed/cockpit and filing one task per post in Drafting, each with its alternates and a media plan.",
    },
    {
      who: "caw",
      text: "Filed Post: one board instead of a wall of agent terminals and Post: answer an agent permission prompt from your phone. Both are in Your call. The third is drafting.",
    },
  ];
  const inkOf = {
    working: "text-status-live-ink",
    idle: "text-ink-muted",
    asks: "text-status-attn-ink",
    off: "text-ink-muted",
    unreachable: "text-status-fail-ink",
  } as const;
  const status = $derived.by(() => {
    if (state === "off" || state === "unreachable") {
      return state;
    }
    return caw.status;
  });
</script>

<div class="flex min-h-full flex-col gap-space-4">
  <div class="flex flex-col gap-space-2">
    <p class="mark-line m-0 flex items-center gap-space-2">
      <img
        alt=""
        class="size-c-mark rounded-sm"
        data-box
        height="26"
        src={cawFace}
        width="26"
      />
      <span class={["type-label", inkOf[status]]}
        >{words.caw.status[status]}</span
      >
      <span class="ms-auto type-meta text-ink-muted"
        >{caw.harness} · {caw.model}</span
      >
    </p>
    {#if state !== "off" && state !== "unreachable"}
      <p class="m-0 type-body text-ink-strong text-pretty">{caw.sentence}</p>
    {/if}
    <div class="flex flex-wrap items-center gap-space-2">
      <Button data-icon="inline-start" size="sm" variant="outline">
        <IconChatAdd aria-hidden="true" />
        <span>{words.cawPane.newConversation}</span>
      </Button>
      <Button data-icon="inline-start" size="sm" variant="outline">
        <IconMaximize aria-hidden="true" />
        <span>{words.cawPane.openSession}</span>
      </Button>
    </div>
    <label
      class="mark-line flex items-center gap-space-3 type-label text-ink-strong"
    >
      <Switch
        checked={caw.events && state !== "off"}
        data-box
        disabled={state === "off"}
      />
      <span>{words.cawPane.events}</span>
    </label>
  </div>

  <div
    class="flex flex-1 flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
    aria-live="polite"
  >
    {#if state === "loading"}
      <Skeleton line="body" width="title" />
      <Skeleton height="block" radius="card" />
      <Skeleton height="row" radius="card" />
    {:else if state === "off"}
      <p class="m-0 type-body text-ink-muted text-pretty">
        {words.cawPane.off}
      </p>
      <div>
        <Button size="sm" variant="outline">{words.cawPane.turnOn}</Button>
      </div>
    {:else if state === "unreachable"}
      <p class="m-0 type-body text-ink-strong text-pretty">
        {words.cawPane.unreachable}
      </p>
    {:else if state === "fresh"}
      <p class="m-0 type-body text-ink-muted text-pretty">
        {words.cawPane.fresh}
      </p>
    {:else}
      {#each TURNS as turn, i (i)}
        <p
          class={[
            "m-0 max-w-c-measure type-body text-pretty",
            turn.who === "person"
              ? "self-end rounded-lg bg-surface-recess px-space-4 py-space-2 text-ink-strong"
              : "text-ink-strong",
          ]}
        >
          {turn.text}
        </p>
      {/each}
    {/if}
  </div>

  <div class="flex flex-col gap-space-2">
    {#if state === "fresh" || state === "conversation"}
      <p class="m-0 type-meta text-ink-muted">{words.cawPane.starters}</p>
      <ul class="m-0 flex list-none flex-col items-start gap-space-2 p-0">
        {#each STARTERS as starter (starter)}
          <li class="max-w-full">
            <button class={chipVariants({ variant: "option" })} type="button">
              {starter}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="flex items-end gap-space-2">
      <div class="min-w-0 flex-1">
        <Textarea
          aria-label={words.cawPane.composer}
          placeholder={words.cawPane.composer}
          rows={2}
          value={draft}
        />
      </div>
      <Button aria-label={words.cawPane.send} icon={IconSend} size="icon" />
    </div>
    {#if state !== "off"}
      <div class="flex justify-end">
        <Button size="xs" tone="quiet" variant="ghost"
          >{words.cawPane.turnOff}</Button
        >
      </div>
    {/if}
  </div>
</div>
