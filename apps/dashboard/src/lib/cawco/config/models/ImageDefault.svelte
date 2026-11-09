<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  /**
   * Models CawCo uses › Images: the provider (and, on the Gemini API, the
   * model) `generate_image` goes to when a call names none, and where the
   * chosen provider can make an image now.
   *
   * On a desk the providers stand in one column, the Gemini API's model
   * under its option as that provider's own setting, and the chosen
   * provider's machines in the next, so a pick shows at once what it means
   * across the fleet; under the `images` container width the machines stand
   * under the providers. Every part stands whatever is chosen (the model
   * setting waits, disabled, while another provider is), so a pick never
   * moves the page under the pointer. A pick saves at once (as the page's
   * switches do): the coral moves with it and the head says Saving… then
   * Saved. A failed save says Not saved in that same line, puts the hub's
   * choice back, and says why right under the providers, where the press
   * was.
   *
   * Every value comes in as props (the section reads and saves), so each
   * state is a story (ImageDefault.stories.ts).
   */
  import {
    IMAGE_PROVIDER_MODELS,
    IMAGE_PROVIDERS,
    type ImageProviderId,
    type ImageSettings,
  } from "@cawco/core/image-generation";
  import type { MachineImageReadiness } from "@cawco/core/image-readiness";
  import {
    type ImageFix,
    imageSettingsWords as words,
  } from "@cawco/core/words/image-settings";
  import { blur } from "svelte/transition";
  import ProviderMark from "#lib/cawco/accounts/ProviderMark.svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import NoMachines from "#lib/cawco/config/NoMachines.svelte";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronRight,
    IconError,
    IconImage,
    IconTick,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import {
    dur,
    easeOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";

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
    /** Why the last save failed, in words. */
    fault?: string | null;
    onchoose: (next: ImageSettings) => void;
  } = $props();

  /** The Gemini marks stand for both Gemini routes; ChatGPT's is OpenAI's. */
  const MARKS: Record<ImageProviderId, string> = {
    chatgpt: "openai-codex",
    antigravity: "google",
    "gemini-api": "google",
  };

  /** The one provider with a choice of model; its setting stands under its option. */
  const MODEL_PROVIDER = "gemini-api" satisfies ImageProviderId;
  const models = IMAGE_PROVIDER_MODELS[MODEL_PROVIDER];

  const chosen = $derived(readiness[value.provider]);
  /** The model its calls go to: the saved one while it is chosen, else its default. */
  const model = $derived(
    value.provider === MODEL_PROVIDER ? (value.model ?? models[0]) : models[0]
  );

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

  function pickModel(picked: string) {
    if (!picked || picked === model || value.provider !== MODEL_PROVIDER) {
      return;
    }
    // The provider's own default saves as none, so it follows the provider.
    onchoose({
      provider: MODEL_PROVIDER,
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
  /** The lack worth saying: none while the machine is offline, whose line says Offline. */
  const shownLack = (machine: MachineImageReadiness) =>
    machine.online ? machine.lack : null;

  const fixHref = (fix: ImageFix) =>
    fix.kind === "page"
      ? `/config/${fix.slug}`
      : `/config/accounts/${encodeURIComponent(fix.accountId)}`;

  const lineBlur = (tier: "--duration-panel" | "--duration-exit") => ({
    duration: dur(tier),
    easing: easeOut,
    amount: 2,
  });
</script>

<!-- The way to put something right: a link in the meta line it follows. -->
{#snippet fixLink(fix: ImageFix)}
  <a
    class="mark-line touch-hit pointer-hit inline-flex items-center gap-space-row type-meta whitespace-nowrap text-link-ink no-underline transition-[opacity] duration-(--duration-control) ease-out hover:text-link-hover active:opacity-72"
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
  <SectionHeader {hue} icon={IconImage} label={words.heading} level={2}>
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
            in:blur={lineBlur("--duration-panel")}
            out:blur={lineBlur("--duration-exit")}
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
      <!-- The Gemini API's own setting, under its option (the last), tied
           to it by the rule down its lead edge; it waits, disabled, while
           another provider is chosen. -->
      <div
        class="ms-space-5 border-s border-border-hairline ps-space-3"
        data-slot="model"
      >
        <Field id="images-model" label={words.model}>
          <Select.Root
            disabled={value.provider !== MODEL_PROVIDER}
            onValueChange={pickModel}
            type="single"
            value={model}
          >
            <Select.Trigger class="w-full" id="images-model">
              {words.modelName(model)}
            </Select.Trigger>
            <Select.Content>
              {#each models as one, index (one)}
                <Select.Item label={words.modelName(one)} value={one}>
                  {#snippet children()}
                    <span>{words.modelName(one)}</span>
                    {#if index === 0}
                      <span class="text-ink-muted">{words.modelDefault}</span>
                    {/if}
                    <span class="num ms-auto ps-space-3 text-ink-muted"
                      >{words.modelPrice(one)}</span
                    >
                  {/snippet}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          {#snippet hint()}
            {words.modelNote(model)}
            <span class="num whitespace-nowrap">{words.modelPrice(model)}</span>
          {/snippet}
        </Field>
      </div>
      {#if fault}
        <!-- Why the pick didn't hold, under the options it was made in,
             brought into view once it has unfolded. -->
        <p
          class="m-0 type-meta text-pretty text-status-fail-ink"
          onintroend={(event) =>
            bringIntoView(event.currentTarget, {
              behavior: motionOk.current ? "smooth" : "auto",
            })}
          role="alert"
          transition:unfold
        >
          {fault}
        </p>
      {/if}
    </div>

    <div class="flex min-w-0 flex-col gap-space-5" data-slot="chosen">
      <div class="flex min-w-0 flex-col gap-space-1">
        <h3 class="m-0 type-label text-ink-muted" id="images-machines">
          {words.machinesHead(value.provider)}
        </h3>
        {#if chosen.length === 0}
          <NoMachines line={words.noMachines} />
        {:else}
          <!-- One row per machine, down fixed columns: its OS mark in the
               lead column; its name, and under it what it lacks with the way
               to put it right; and at the trailing edge its state as a glyph
               alone (the word is its name and tooltip), at one x on every
               row. A ready machine is one quiet line; an offline one says
               Offline, and nothing it lacked. -->
          <ul
            aria-labelledby="images-machines"
            class="m-0 flex min-w-0 list-none flex-col p-0"
          >
            {#each chosen as machine (machine.machineId)}
              {@const lack = shownLack(machine)}
              {@const fix = lack ? words.fix(lack) : null}
              {@const state = stateOf(machine)}
              <li
                class="flex min-h-c-row-h-two items-center gap-x-space-3 border-b border-border-hairline py-space-1 last:border-b-0"
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
                  {#if state === "offline"}
                    <span class="type-meta text-ink-muted">{words.offline}</span
                    >
                  {:else if lack}
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
