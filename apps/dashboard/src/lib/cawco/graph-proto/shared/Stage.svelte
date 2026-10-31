<script lang="ts">
  import { humanize } from "@cawco/core/tool-presentation";
  /**
   * The live component under review, standing in one state at the width and
   * scheme the view settings give it: the real TaskColumn, one instance whose
   * args change, so the move into a state is the column's own motion. A
   * state previewed over it (`peek`) stands as a second instance on top,
   * the kept one held under it, and the differences are washed: what came in
   * or changed on the preview, what went where it stood (The One Target
   * Rule's 1px edge, the diff washes). Against another stage (`against`),
   * the same washes on this one alone. Remarks stand as pins on their state;
   * in Comment mode a press places one, with the composer beside it.
   */
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import { tick } from "svelte";
  import PinMark from "#lib/cawco/preview/PinMark.svelte";
  import TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import type { Judge } from "./judge.svelte";
  import { type Mark, marksOf } from "./marks";
  import { stateOf } from "./review.svelte";

  let {
    judge,
    story,
    peek = null,
    live = false,
    against = null,
    marking = null,
    root = $bindable(null),
    pins = true,
    class: className = "",
  }: {
    judge: Judge;
    story: string;
    /** A state previewed over this one. */
    peek?: string | null;
    /** This stage is the one the moves play on. */
    live?: boolean;
    /** Another stage's component to wash this one against. */
    against?: HTMLElement | null;
    marking?: "came" | "went" | null;
    root?: HTMLElement | null;
    pins?: boolean;
    class?: string;
  } = $props();

  let peekRoot = $state<HTMLElement | null>(null);
  let box = $state<HTMLElement | null>(null);
  let marks = $state.raw<Mark[]>([]);

  $effect(() => {
    if (live) {
      judge.runner.root = root;
    }
  });

  const frame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));

  // The washes, once both stands have settled.
  $effect(() => {
    const keys = [
      story,
      peek,
      against,
      marking,
      judge.runner.running,
      judge.runner.held,
      judge.count,
      judge.longest,
      judge.width,
    ];
    let gone = false;
    (async () => {
      await tick();
      await frame();
      await frame();
      if (gone || !keys || !root) {
        return;
      }
      if (peek && peekRoot) {
        for (const one of peekRoot.getAnimations({ subtree: true })) {
          one.finish();
        }
        marks = [
          ...marksOf(root, peekRoot, "went"),
          ...marksOf(peekRoot, root, "came"),
        ];
      } else if (against && marking && !judge.runner.running) {
        marks = marksOf(root, against, marking);
      } else {
        marks = [];
      }
    })();
    return () => {
      gone = true;
    };
  });

  /* --- Remarks ---------------------------------------------------------- */

  const shown = $derived(pins && !peek ? judge.remarksOn(story) : []);
  let open = $state<number | null>(null);
  let target = $state<{
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
  } | null>(null);
  let draft = $state<{
    at: { x: number; y: number };
    px: { x: number; y: number };
    element: string;
  } | null>(null);
  let words_ = $state("");

  /** An element in words: its card's title, its button's words, its slot. */
  function nameOf(el: Element): string {
    const button = el.closest("button, a");
    const own = button?.textContent?.trim();
    if (button && own && own.length < 40) {
      return own;
    }
    const head = el
      .closest("[data-task]")
      ?.querySelector("[data-task-head]")
      ?.textContent?.trim();
    if (head) {
      return head.length > 40 ? `${head.slice(0, 39)}…` : head;
    }
    const slot = el.closest("[data-slot]")?.getAttribute("data-slot");
    return slot ? humanize(slot) : words.wholeState;
  }

  function under(event: PointerEvent): Element | null {
    return (
      document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((one) => root?.contains(one) && one !== root) ?? null
    );
  }

  function aim(event: PointerEvent) {
    const el = under(event);
    if (!(el && root && box)) {
      target = null;
      return;
    }
    const origin = box.getBoundingClientRect();
    const scale = origin.width / (box.offsetWidth || 1);
    const rect = el.getBoundingClientRect();
    target = {
      x: (rect.left - origin.left) / scale,
      y: (rect.top - origin.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale,
      name: nameOf(el),
    };
  }

  function place(event: PointerEvent) {
    if (!(root && box)) {
      return;
    }
    const el = under(event);
    const origin = box.getBoundingClientRect();
    const scale = origin.width / (box.offsetWidth || 1);
    const own = root.getBoundingClientRect();
    const px = {
      x: (event.clientX - origin.left) / scale,
      y: (event.clientY - origin.top) / scale,
    };
    draft = {
      px,
      at: {
        x: (event.clientX - own.left) / own.width,
        y: (event.clientY - own.top) / own.height,
      },
      element: el ? nameOf(el) : words.wholeState,
    };
    words_ = "";
    open = null;
  }

  function send() {
    if (!(draft && words_.trim())) {
      return;
    }
    judge.remark(story, draft.at, draft.element, words_.trim());
    draft = null;
    words_ = "";
    judge.commenting = false;
    target = null;
  }

  const path = $derived(
    `${stateOf(story).group} › ${stateOf(story).name} · ${judge.scheme === "dark" ? words.dark : words.light} · ${judge.width}`
  );
</script>

<div
  class={[
    "relative mx-auto w-max max-w-full",
    judge.scheme === "dark" && "dark",
    className,
  ]}
  data-proto-stage={story}
  style:color-scheme={judge.scheme}
>
  <div
    bind:this={box}
    class="relative rounded-lg bg-surface-page p-space-3 text-ink-strong inset-ring inset-ring-border-hairline"
  >
    <div class="relative" style:width="{judge.width}px">
      <div
        bind:this={root}
        class={["flex flex-col", peek && "invisible"]}
        data-proto-live={live || undefined}
      >
        <TaskColumn {...judge.argsOf(story)} />
      </div>
      {#if peek}
        <div
          bind:this={peekRoot}
          class="absolute inset-x-0 top-0 flex flex-col"
        >
          <TaskColumn {...stateOf(peek).args} />
        </div>
      {/if}
      <!-- The washes: what came in or changed, what went (DESIGN.md, The design graph: "washing what came in, what changed and what went"). -->
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        {#each marks as mark, index (index)}
          <span
            class={[
              "absolute outline-1 outline-solid",
              mark.kind === "came"
                ? "bg-diff-add-bg outline-(color:--diff-add-emphasis)"
                : "bg-diff-del-bg outline-dashed outline-(color:--diff-del-emphasis)",
            ]}
            data-mark={mark.kind}
            style:border-radius="{mark.radius}px"
            style:height="{mark.h}px"
            style:left="{mark.x}px"
            style:top="{mark.y}px"
            style:width="{mark.w}px"
          ></span>
        {/each}
      </div>
      {#each shown as remark (remark.id)}
        {#if remark.at}
          <button
            aria-expanded={open === remark.id}
            aria-label="{words.remarks} {remark.id}: {remark.words}"
            class="absolute z-10 -translate-y-full rounded-pill touch-hit focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
            data-remark={remark.id}
            onclick={() => {
              open = open === remark.id ? null : remark.id;
            }}
            style:left="{remark.at.x * 100}%"
            style:top="{remark.at.y * 100}%"
            type="button"
          >
            <PinMark focused={open === remark.id} number={remark.id} />
          </button>
          {#if open === remark.id}
            <div
              class="absolute z-20 w-c-pin-card-w max-w-[calc(100vw-2*var(--space-3))] rounded-lg border border-border-control bg-surface-raised p-space-3 shadow-overlay"
              data-thread={remark.id}
              style:left="min({remark.at.x * 100}% + var(--space-4), 100% -
              var(--c-pin-card-w) + var(--space-6))"
              style:top="{remark.at.y * 100}%"
            >
              <p class="m-0 type-label text-ink-row">{remark.element}</p>
              <p class="m-0 mt-space-1 type-body text-ink-strong">
                {remark.words}
              </p>
              <p class="m-0 mt-space-2 type-meta text-ink-subtle">
                {words.onState(judge.pathOf(remark))}
              </p>
            </div>
          {/if}
        {/if}
      {/each}
    </div>
    {#if judge.commenting && pins && !peek}
      <!-- Comment mode: the press is the remark's place (DESIGN.md, Placing a comment). -->
      <div
        class="absolute inset-0 z-30 cursor-crosshair"
        data-commenting
        onpointerdown={(event) => {
          if (!draft) {
            place(event);
          }
        }}
        onpointerleave={() => {
          target = null;
        }}
        onpointermove={aim}
        role="presentation"
      >
        {#if target && !draft}
          <span
            class="pointer-events-none absolute rounded-xs bg-c-target-tint"
            style:height="{target.h}px"
            style:left="{target.x}px"
            style:top="{target.y}px"
            style:width="{target.w}px"
          >
            <span
              class="absolute start-0 bottom-full mb-space-1 rounded-xs border border-border-control bg-surface-raised px-space-1 type-meta whitespace-nowrap text-ink-strong"
              >{target.name}</span
            >
          </span>
        {/if}
      </div>
    {/if}
    {#if draft}
      <span
        class="pointer-events-none absolute z-40 -translate-y-full"
        style:left="{draft.px.x}px"
        style:top="{draft.px.y}px"
      >
        <PinMark state="provisional" />
      </span>
      <form
        class="absolute z-40 flex w-c-pin-card-w max-w-[calc(100vw-2*var(--space-3))] flex-col gap-space-2 rounded-lg border border-border-control bg-surface-raised p-space-3 shadow-overlay"
        data-composer
        onsubmit={(event) => {
          event.preventDefault();
          send();
        }}
        style:left="clamp(0px, {draft.px.x + 16}px, 100% - var(--c-pin-card-w))"
        style:top="{draft.px.y}px"
      >
        <span class="type-label text-ink-row">{draft.element}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
          aria-label={words.composer}
          autofocus
          onkeydown={(event) => {
            if (event.key === "Escape") {
              draft = null;
            }
          }}
          class="min-h-c-btn-h-lg w-full resize-none rounded-md border border-border-control bg-surface-page p-space-2 type-body text-ink-strong placeholder:text-ink-subtle focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
          placeholder={words.composer}
          bind:value={words_}></textarea>
        <span class="type-meta text-ink-subtle">{path}</span>
        <span class="flex justify-end gap-space-2">
          <Button
            onclick={() => {
              draft = null;
            }}
            size="sm"
            variant="ghost">{words.cancel}</Button
          >
          <Button disabled={!words_.trim()} size="sm" type="submit"
            >{words.send}</Button
          >
        </span>
      </form>
    {/if}
  </div>
</div>
