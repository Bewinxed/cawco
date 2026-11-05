<script lang="ts">
  /**
   * Models CawCo uses › Images: the provider (and, on the Gemini API, the
   * model) `generate_image` goes to when a call names none, and where the
   * chosen provider can make an image now.
   *
   * On a desk the providers stand in one column and the chosen one's model
   * and machines in the next, so a pick shows at once what it means across
   * the fleet; under the `images` container width the second column stands
   * under the first. A pick saves at once (as the page's switches do): the
   * coral moves with it, the head says Saving… then Saved, and a refusal
   * puts the hub's choice back and stands under the group in its words.
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
  import { imageSettingsWords as words } from "@cawco/core/words/image-settings";
  import { blur } from "svelte/transition";
  import ProviderMark from "#lib/cawco/accounts/ProviderMark.svelte";
  import { dur, easeOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import {
    IconChevronRight,
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
    /** A save on its way, or just landed. */
    phase?: "idle" | "saving" | "saved";
    /** Why the last save or read failed, in words. */
    fault?: string | null;
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
    const ready = all.filter((one) => one.lack === null).length;
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

  const fixHref = (fix: NonNullable<ReturnType<typeof words.fix>>) =>
    fix.kind === "page"
      ? `/config/${fix.slug}`
      : `/config/accounts/${encodeURIComponent(fix.accountId)}`;

  const lineBlur = (tier: "--dur-panel" | "--dur-exit") => ({
    duration: dur(tier),
    easing: easeOut,
    amount: 2,
  });
</script>

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

    <div class="flex min-w-0 flex-col gap-space-5" data-slot="chosen">
      {#if offersModelChoice(value.provider)}
        <div class="flex min-w-0 flex-col gap-space-2" transition:unfold>
          <p class="m-0 type-label text-ink-muted" id="images-model">
            {words.model}
          </p>
          <OptionGroup
            aria-labelledby="images-model"
            bind:value={() => [model], pickModel}
          >
            {#each models as one, index (one)}
              <OptionGroupItem digit={index + 1} value={one}>
                <code class="type-code">{one}</code>
                {#if index === 0}
                  <span class="type-meta text-ink-muted"
                    >{words.modelDefault}</span
                  >
                {/if}
              </OptionGroupItem>
            {/each}
          </OptionGroup>
        </div>
      {/if}

      <div class="flex min-w-0 flex-col gap-space-1">
        <p class="m-0 type-label text-ink-muted" id="images-machines">
          {words.machinesHead}
        </p>
        {#if chosen.length === 0}
          <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
            {words.noMachines}
          </p>
        {:else}
          <!-- One row per machine: its OS mark in the lead column, its name
             over where the chosen provider stands there, and the way to put
             a lack right at the trailing edge, at every width. -->
          <ul
            aria-labelledby="images-machines"
            class="m-0 flex min-w-0 list-none flex-col p-0"
          >
            {#each chosen as machine (machine.machineId)}
              {@const fix = machine.lack ? words.fix(machine.lack) : null}
              <li
                class="flex min-h-c-row-h-two items-center gap-x-space-3 border-b border-border-hairline py-space-1 last:border-b-0"
                data-lack={machine.lack?.kind}
              >
                <span
                  class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
                >
                  <OsMark class="size-icon-md" os={machine.os} />
                </span>
                <span class="flex min-w-0 flex-auto flex-col">
                  <span class="flex min-w-0 items-baseline gap-space-1">
                    <span class="truncate type-label text-ink-strong"
                      >{machine.name}</span
                    >
                    {#if !machine.online}
                      <span class="flex-none type-meta text-ink-subtle"
                        >{words.offline}</span
                      >
                    {/if}
                  </span>
                  <span
                    class="mark-line flex min-w-0 items-center gap-space-1 type-meta"
                  >
                    {#if machine.lack === null}
                      <IconTick
                        class="size-icon-sm flex-none text-status-done-glyph"
                      />
                      <span class="text-ink-muted">{words.ready}</span>
                    {:else if machine.lack.kind === "agy-installing"}
                      <LiveDot data-pulse size="row" tone="muted" />
                      <span class="text-ink-muted"
                        >{words.lack(machine.lack)}</span
                      >
                    {:else}
                      <IconWarningTriangle
                        aria-hidden="true"
                        class="size-icon-sm flex-none text-status-attn-glyph"
                      />
                      <span class="min-w-0 text-ink-strong text-pretty"
                        >{words.lack(machine.lack)}</span
                      >
                    {/if}
                  </span>
                </span>
                {#if fix}
                  <a
                    class="mark-line touch-hit pointer-hit inline-flex flex-none items-center gap-space-row type-meta whitespace-nowrap text-link-ink no-underline transition-[opacity] duration-(--dur-control) ease-out hover:text-link-hover active:opacity-72"
                    href={fixHref(fix)}
                  >
                    <span>{fix.label}</span>
                    <IconChevronRight aria-hidden="true" class="size-icon-sm" />
                  </a>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>

  {#if fault}
    <p
      class="m-0 type-meta wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
      role="alert"
      transition:unfold
    >
      {fault}
    </p>
  {/if}
</div>
