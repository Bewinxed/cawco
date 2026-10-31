<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconSend } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import type { Decision, Thread } from "./model.js";
  import { since } from "./model.js";
  import { ARRIVE } from "./motion.js";

  export type Push = "push" | "actions" | "reply" | "sent" | "failed" | "group";

  /**
   * The phone's lock screen, where a push reads as a message from the agent:
   * who asked, from which project, that it stops work, the question and the
   * recommended option. Held open, a single-pick ask with one to three
   * options offers each as an action and "Reply in your words" (iOS allows
   * four); any other ask, or a group, offers Open. After a tap the push
   * says in a second line whether the answer landed.
   */
  let {
    thread,
    decision,
    group,
    push: pushArg = "push",
  }: {
    thread: Thread;
    decision: Decision;
    /** A group push: its topic and how many stop work. */
    group?: { topic: string; count: number };
    push?: Push;
  } = $props();

  let push = $derived(pushArg);
  let tapped = $state("");
  const oneTap = $derived(
    !(group || decision.multiple) && decision.options.length <= 3
  );
  const recommended = $derived(decision.options.find((o) => o.recommended));
  const answer = $derived(tapped || recommended?.label || "");
</script>

<div
  class="flex min-h-dvh flex-col items-center gap-space-6 bg-surface-recess-deep px-space-3 pt-space-8 pb-space-6"
>
  <p class="flex flex-col items-center">
    <span class="type-label text-ink-muted">Saturday 31 October</span>
    <span class="type-kpi text-ink-strong tabular-nums">14:50</span>
  </p>

  <div class="flex w-full min-w-0 flex-col gap-space-2">
    <article
      class="flex min-w-0 flex-col gap-space-1 rounded-panel bg-material-panel p-space-4 shadow-tile"
      aria-label="Notification from Caw&Co"
    >
      <p class="type-meta flex items-center justify-between text-ink-muted">
        <span>Caw&amp;Co</span>
        <span class="tabular-nums">{since(thread.since)} ago</span>
      </p>
      {#if group}
        <p class="type-label text-ink-strong">
          {thread.harness} · {thread.project}
        </p>
        <p class="type-body text-pretty text-ink-strong">
          <span class="tabular-nums">{group.count}</span> about {group.topic}
          · both stop work
        </p>
      {:else}
        <p class="type-label text-ink-strong">
          {thread.harness} · {thread.project} · stops work
        </p>
        <p class="type-body text-pretty text-ink-strong">{decision.question}</p>
        {#if recommended && push !== "sent" && push !== "failed"}
          <p class="type-meta text-ink-muted">
            Recommended: {recommended.label}
          </p>
        {/if}
      {/if}
      {#if push === "sent"}
        <p
          class={cn("type-meta mt-space-1 text-pretty text-ink-strong", ARRIVE)}
        >
          {tapped === "your words"
            ? `Sent. ${thread.harness} is reading your words.`
            : `Sent. ${thread.harness} resumed with ${answer}.`}
        </p>
      {:else if push === "failed"}
        <p class={cn("type-meta mt-space-1 text-pretty text-error-11", ARRIVE)}>
          Couldn't send. Open to answer.
        </p>
      {/if}
    </article>

    {#if push === "actions"}
      <ul
        class="flex min-w-0 flex-col overflow-hidden rounded-panel bg-material-panel shadow-tile"
        aria-label="Answers"
      >
        {#if oneTap && !group}
          {#each decision.options as option (option.id)}
            <li class="border-border-hairline border-b">
              <Button
                align="row"
                class="w-full"
                onclick={() => {
                  tapped = option.label;
                  push = "sent";
                }}
                press="tint"
                size="lg"
                variant="ghost"
              >
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{option.label}</span
                >
              </Button>
            </li>
          {/each}
          <li>
            <Button
              align="row"
              class="w-full"
              onclick={() => {
                push = "reply";
              }}
              press="tint"
              size="lg"
              variant="ghost">Reply in your words</Button
            >
          </li>
        {:else}
          <li>
            <Button
              align="row"
              class="w-full"
              press="tint"
              size="lg"
              variant="ghost">Open</Button
            >
          </li>
        {/if}
      </ul>
    {:else if push === "group"}
      <ul
        class="flex min-w-0 flex-col overflow-hidden rounded-panel bg-material-panel shadow-tile"
        aria-label="Answers"
      >
        <li>
          <Button
            align="row"
            class="w-full"
            press="tint"
            size="lg"
            variant="ghost">Open</Button
          >
        </li>
      </ul>
    {:else if push === "reply"}
      <form
        class="grid min-w-0 grid-cols-fluid-auto items-center gap-space-2 rounded-panel bg-material-panel p-space-2 shadow-tile"
        onsubmit={(event) => {
          event.preventDefault();
          tapped = "your words";
          push = "sent";
        }}
      >
        <Input
          aria-label="Reply in your words"
          placeholder="Reply in your words"
        />
        <Button aria-label="Send" icon={IconSend} size="icon" type="submit" />
      </form>
    {/if}
  </div>
</div>
