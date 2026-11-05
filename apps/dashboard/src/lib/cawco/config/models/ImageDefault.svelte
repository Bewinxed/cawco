<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  /**
   * Models CawCo uses › Images: the provider (and, on the Gemini API, the
   * model) `generate_image` goes to when a call names none, and where the
   * chosen provider can make an image now.
   *
   * On a desk the providers stand in one column and the chosen one's model
   * and machines in the next, so a pick shows at once what it means across
   * the fleet; under the `images` container width the second column stands
   * under the first. A pick saves at once (as the page's switches do): the
   * coral moves with it and the head says Saving… then Saved. A failed save
   * says Not saved in that same line, puts the hub's choice back, and says
   * why right under the providers, where the press was.
   *
   * Every value comes in as props (the section reads and saves), so each
   * state is a story (ImageDefault.stories.ts).
   */
  import {
    IMAGE_PROVIDER_MODELS,
    IMAGE_PROVIDERS,
    type ImageProviderId,
    type ImageSettings,
    offersModelChoice,
  } from "@cawco/core/image-generation";
  import type { MachineImageReadiness } from "@cawco/core/image-readiness";
  import {
    type ImageFix,
    imageSettingsWords as words,
  } from "@cawco/core/words/image-settings";
  import { blur } from "svelte/transition";
  import ProviderMark from "#lib/cawco/accounts/ProviderMark.svelte";
  import { dur, easeOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronRight,
    IconError,
    IconImage,
    IconTick,
    IconWarningTriangle,
  } from "#lib/icons.js";

  let {
    hue,
    value,
    readiness,
    phase = "idle",
    fault = null,
    onchoose,
  }: {
    /** The section's hue, for the head's glyph. */
    hue: string;
    /** The choice shown: the hub's, or the one being saved. */
    value: ImageSettings;
    /** Each provider on each machine (core `imageReadiness`). */
    readiness: Record<ImageProviderId, MachineImageReadiness[]>;
    /** A save on its way, just landed, or refused. */
    phase?: "idle" | "saving" | "saved" | "failed";
    /** Why the last save failed, in words, and where it is put right. */
    fault?: { words: string; fix?: ImageFix } | null;
    onchoose: (next: ImageSettings) => void;
  } = $props();

  /** The Gemini marks stand for both Gemini routes; ChatGPT's is OpenAI's. */
  const MARKS: Record<ImageProviderId, string> = {
    chatgpt: "openai-codex",
    antigravity: "google",
    "gemini-api": "google",
  };

  const chosen = $derived(readiness[value.provider]);
  const models = $derived(IMAGE_PROVIDER_MODELS[value.provider]);
  const model = $derived(value.model ?? models[0]);

  const standing = (provider: ImageProviderId) => {
    const all = readiness[provider];
    const ready = all.filter((one) => one.online && one.lack === null).length;
    return { ready, of: all.length, words: words.standing(ready, all.length) };
  };

  function pickProvider(next: string[]) {
    const provider = IMAGE_PROVIDERS.find((one) => one === next[0]);
    if (provider && provider !== value.provider) {
      onchoose({ provider, model: null });
    }
  }

  function pickModel(next: string[]) {
    const [picked] = next;
    if (!picked || picked === model) {
      return;
    }
    // The provider's own default saves as none, so it follows the provider.
    onchoose({
      provider: value.provider,
      model: picked === models[0] ? null : picked,
    });
  }

  /**
   * A machine's state: offline first (whatever it last said, it makes no
   * image now, and a step it was in the middle of is not going on), then
   * ready, installing, or not ready. Its word is its glyph's name and
   * tooltip.
   */
  type State = "offline" | "ready" | "installing" | "not-ready";
  const stateOf = (machine: MachineImageReadiness): State => {
    if (!machine.online) {
      return "offline";
    }
    if (machine.lack === null) {
      return "ready";
    }
    return machine.lack.kind === "agy-installing" ? "installing" : "not-ready";
  };
  const STATE_WORDS: Record<State, string> = {
    offline: words.offline,
    ready: words.ready,
    installing: words.installing,
    "not-ready": words.notReady,
  };
  /** The lack worth saying: an install that was going on says nothing once the machine is gone. */
  const shownLack = (machine: MachineImageReadiness) =>
    machine.lack && !(machine.lack.kind === "agy-installing" && !machine.online)
      ? machine.lack
      : null;

  const fixHref = (fix: ImageFix) =>
    fix.kind === "page"
      ? `/config/${fix.slug}`
      : `/config/accounts/${encodeURIComponent(fix.accountId)}`;

  const lineBlur = (tier: "--dur-panel" | "--dur-exit") => ({
    duration: dur(tier),
    easing: easeOut,
    amount: 2,
  });
</script>

<!-- The way to put something right: a link in the meta line it follows. -->
{#snippet fixLink(fix: ImageFix)}
  <a
    class="mark-line touch-hit pointer-hit inline-flex items-center gap-space-row type-meta whitespace-nowrap text-link-ink no-underline transition-[opacity] duration-(--dur-control) ease-out hover:text-link-hover active:opacity-72"
    href={fixHref(fix)}
  >
    <span>{fix.label}</span>
    <IconChevronRight aria-hidden="true" class="size-icon-sm" data-box />
  </a>
{/snippet}

<div
  data-slot="group"
  class="@container/images flex flex-col gap-space-2 border-t border-border-hairline pt-space-5"
  data-group="images"
>
  <SectionHeader {hue} icon={IconImage} label={words.heading}>
    {#snippet right()}
      <!-- The save's line: one cell the words cross-fade in, so the head
           keeps its height whatever it says. -->
      <p
        aria-live="polite"
        class="mark-line m-0 grid min-h-c-btn-h-sm items-center type-meta text-ink-muted"
        data-slot="save"
      >
        {#key phase}
          <span
            class="mark-line col-start-1 row-start-1 flex items-center gap-space-2"
            in:blur={lineBlur("--dur-panel")}
            out:blur={lineBlur("--dur-exit")}
          >
            {#if phase === "saving"}
              <LiveDot data-pulse size="row" tone="muted" />
              <span>{words.saving}</span>
            {:else if phase === "saved"}
              <IconTick class="size-icon-md flex-none text-status-done-glyph" />
              <span class="text-ink-strong">{words.saved}</span>
            {:else if phase === "failed"}
              <IconError
                aria-hidden="true"
                class="size-icon-md flex-none text-status-fail-glyph"
              />
              <span class="text-status-fail-ink">{words.notSaved}</span>
            {/if}
          </span>
        {/key}
      </p>
    {/snippet}
  </SectionHeader>
  <p data-slot="note" class="m-0 type-meta max-w-c-measure text-ink-muted">
    {words.note}
  </p>

  <div
    class="grid min-w-0 grid-cols-1 items-start gap-space-5 @images/images:grid-cols-2 @images/images:gap-space-6"
    data-slot="split"
  >
    <div class="flex min-w-0 flex-col gap-space-2" data-slot="providers">
      <OptionGroup
        aria-label={words.providers}
        layout="list"
        bind:value={() => [value.provider], pickProvider}
      >
        {#each IMAGE_PROVIDERS as provider, index (provider)}
          {@const stands = standing(provider)}
          <OptionGroupItem digit={index + 1} value={provider}>
            <span class="grid h-lh place-items-center type-label">
              <ProviderMark provider={MARKS[provider]} />
            </span>
            <span class="flex min-w-0 flex-col gap-space-row">
              <span class="type-label text-ink-strong"
                >{words.name(provider)}</span
              >
              <span class="type-meta text-ink-muted text-pretty"
                >{words.runsOn(provider)}</span
              >
              {#if stands.of > 0}
                <span
                  class="mark-line num flex items-center gap-space-1 type-meta"
                  data-slot="standing"
                >
                  <!-- Every machine: the tick. Short of that, the warning glyph,
                   in the attention hue only on the provider calls go to. -->
                  {#if stands.ready === stands.of}
                    <IconTick
                      class="size-icon-sm flex-none text-status-done-glyph"
                    />
                    <span class="text-ink-muted">{stands.words}</span>
                  {:else}
                    <IconWarningTriangle
                      aria-hidden="true"
                      class={[
                        "size-icon-sm flex-none",
                        provider === value.provider
                          ? "text-status-attn-glyph"
                          : "text-ink-subtle",
                      ]}
                    />
                    <span
                      class={provider === value.provider
                        ? "text-status-attn-ink"
                        : "text-ink-muted"}>{stands.words}</span
                    >
                  {/if}
                </span>
              {/if}
            </span>
          </OptionGroupItem>
        {/each}
      </OptionGroup>
      {#if fault}
        <!-- Why the pick didn't hold, under the options it was made in,
             brought into view once it has unfolded. -->
        <p
          class="m-0 flex flex-wrap items-baseline gap-x-space-2 type-meta text-pretty"
          onintroend={(event) =>
            bringIntoView(event.currentTarget, {
              behavior: motionOk.current ? "smooth" : "auto",
            })}
          role="alert"
          transition:unfold
        >
          <span class="text-status-fail-ink">{fault.words}</span>
          {#if fault.fix}
            {@render fixLink(fault.fix)}
          {/if}
        </p>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-space-5" data-slot="chosen">
      {#if offersModelChoice(value.provider)}
        <div class="flex min-w-0 flex-col gap-space-2" transition:unfold>
          <p class="m-0 type-label text-ink-muted" id="images-model">
            {words.model}
          </p>
          <OptionGroup
            aria-label={words.models}
            layout="list"
            bind:value={() => [model], pickModel}
          >
            {#each models as one, index (one)}
              <OptionGroupItem digit={index + 1} value={one}>
                <span class="flex min-w-0 flex-col gap-space-row">
                  <span class="flex items-baseline gap-space-2">
                    <span class="type-label text-ink-strong"
                      >{words.modelName(one)}</span
                    >
                    {#if index === 0}
                      <span class="type-meta text-ink-muted"
                        >{words.modelDefault}</span
                      >
                    {/if}
                  </span>
                  <span class="num type-meta text-ink-muted text-pretty"
                    >{words.modelNote(one)}
                    <span class="whitespace-nowrap"
                      >{words.modelPrice(one)}</span
                    ></span
                  >
                </span>
              </OptionGroupItem>
            {/each}
          </OptionGroup>
        </div>
      {/if}

      <div class="flex min-w-0 flex-col gap-space-1">
        <p class="m-0 type-label text-ink-muted" id="images-machines">
          {words.machinesHead(value.provider)}
        </p>
        {#if chosen.length === 0}
          <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
            {words.noMachines}
          </p>
        {:else}
          <!-- One row per machine, down fixed columns: its OS mark in the
               lead column; its name, and under it what it lacks with the way
               to put it right; and at the trailing edge its state as a glyph
               alone (the word is its name and tooltip), at one x on every
               row. A ready machine is one quiet line. -->
          <ul
            aria-labelledby="images-machines"
            class="m-0 flex min-w-0 list-none flex-col p-0"
          >
            {#each chosen as machine (machine.machineId)}
              {@const lack = shownLack(machine)}
              {@const fix = lack ? words.fix(lack) : null}
              {@const state = stateOf(machine)}
              <li
                class="flex min-h-c-row-h items-center gap-x-space-3 border-b border-border-hairline py-space-1 last:border-b-0"
                data-lack={lack?.kind}
                data-state={state}
              >
                <span
                  class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
                >
                  <OsMark class="size-icon-md" os={machine.os} />
                </span>
                <span class="flex min-w-0 flex-auto flex-col">
                  <span
                    class="truncate type-label"
                    class:text-ink-muted={state === "offline"}
                    class:text-ink-strong={state !== "offline"}
                    >{machine.name}</span
                  >
                  {#if lack}
                    <span
                      class="flex min-w-0 flex-wrap items-baseline gap-x-space-2"
                    >
                      <span
                        class="min-w-0 type-meta text-pretty"
                        class:text-ink-muted={state !== "not-ready"}
                        class:text-ink-strong={state === "not-ready"}
                        >{words.lack(lack)}</span
                      >
                      {#if fix}
                        {@render fixLink(fix)}
                      {/if}
                    </span>
                  {/if}
                </span>
                <Tip label={STATE_WORDS[state]} tap>
                  {#snippet children(tip)}
                    <span
                      {...tip}
                      aria-label={STATE_WORDS[state]}
                      class="mark-line grid w-c-row-lead flex-none place-items-center"
                      data-slot="state"
                      role="img"
                    >
                      {#if state === "ready"}
                        <IconTick
                          class="size-icon-md text-status-done-glyph"
                          data-box
                        />
                      {:else if state === "installing"}
                        <LiveDot data-box data-pulse size="row" tone="muted" />
                      {:else if state === "offline"}
                        <!-- The machine list's offline mark: a still dot in the presence-off ink. -->
                        <span
                          class="size-(--status-dot-size) rounded-pill bg-presence-off"
                          data-box
                        ></span>
                      {:else}
                        <IconWarningTriangle
                          aria-hidden="true"
                          class="size-icon-md text-status-attn-glyph"
                          data-box
                        />
                      {/if}
                    </span>
                  {/snippet}
                </Tip>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</div>
