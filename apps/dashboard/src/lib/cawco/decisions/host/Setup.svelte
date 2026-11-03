<!--
  A project's setup (the decision library's `Setup`; the project-setup
  skill): Caw drafts it as data and the person shapes it in place on the
  house's own controls, so every project's page is one design. The page's
  title is the project's name, renamed where it stands (SetupTitle, in the
  page's head), and its Send names it ("Set up <name>", Decisions).

  - What it is for: Caw's paragraph under the title, text at rest with no
    box and no label, a field only while it has focus (the house Textarea's
    `prose` look; DESIGN.md, The Caret Rule), growing a line at a time.
  - Stages: under the house's section head, one row per stage in order, on
    the board's own terms (its column head's mark, its name, its kind),
    each part a house control at rest, so nothing waits on a pointer: the
    mark is the icon tile, a button opening the house menu of glyphs and
    colours; the name is the kit's field; the kind is a setting chip opening
    the house menu of kinds, wording the kind only where the name doesn't
    already say it; More moves or removes the stage. What a stage's hooks do
    stands under it. Add a stage last.
  - Delegate types: only when Caw proposed any; one row each, its name and
    what runs it, its brief under, and More to remove it; one removed waits
    under them with Add back.

  Every change is kept through the page's bridge (`cawco.set`, hub
  setup.ts): `aim`, `stages`, `delegates` and, as drafted, `shape`; the
  name is SetupTitle's. A reload or a revision draws what the hub kept.
-->
<script lang="ts">
  import type { StageColor, StageIcon, StageKind } from "@cawco/core/views";
  import { STAGE_COLORS, STAGE_ICONS, STAGE_KINDS } from "@cawco/core/views";
  import {
    stageLookWords,
    setupPageWords as words,
  } from "@cawco/core/words/onboarding";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import {
    IconChevronDown,
    IconMore,
    IconNeedsYou,
    IconNotYet,
    IconPlus,
  } from "#lib/icons.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "../../tasks/stage-look";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";

  interface Stage {
    color?: StageColor;
    hooks?: Record<string, string>;
    icon?: StageIcon;
    kind: StageKind;
    line?: string;
    name: string;
  }
  interface Delegate {
    brief: string;
    id: string;
    name: string;
    runs?: string;
  }
  interface Node<T> {
    props?: Partial<T>;
  }

  let {
    props,
  }: OpenUIRenderProps<{
    name: unknown;
    aim: unknown;
    stages: unknown[];
    delegates?: unknown[];
    shape?: unknown;
  }> = $props();

  const asKind = (value: unknown): StageKind =>
    STAGE_KINDS.find((kind) => kind === value) ?? "todo";
  const HOOK_KEYS = ["runs", "until", "after", "by"];
  /** A stage as the program drafts it, or as the hub kept it (its hooks flat beside its look). */
  const stageOf = (held: Partial<Stage> & Record<string, unknown>): Stage => {
    const hooks =
      held.hooks ??
      Object.fromEntries(
        HOOK_KEYS.filter((key) => typeof held[key] === "string").map((key) => [
          key,
          String(held[key]),
        ])
      );
    return {
      name: String(held.name ?? ""),
      kind: asKind(held.kind),
      ...(held.icon && (STAGE_ICONS as readonly string[]).includes(held.icon)
        ? { icon: held.icon }
        : {}),
      ...(held.color && (STAGE_COLORS as readonly string[]).includes(held.color)
        ? { color: held.color }
        : {}),
      ...(Object.keys(hooks).length > 0 ? { hooks } : {}),
      ...(held.line ? { line: String(held.line) } : {}),
    };
  };
  const drafted = $derived({
    aim: String(props.aim ?? ""),
    stages: (Array.isArray(props.stages) ? props.stages : []).map((node) =>
      stageOf((node as Node<Stage>)?.props ?? {})
    ),
    delegates: (Array.isArray(props.delegates) ? props.delegates : []).map(
      (node): Delegate => {
        const held = (node as Node<Delegate>)?.props ?? {};
        return {
          id: String(held.id ?? ""),
          name: String(held.name ?? held.id ?? ""),
          brief: String(held.brief ?? ""),
          ...(held.runs ? { runs: String(held.runs) } : {}),
        };
      }
    ),
  });

  /** What the hub kept under a key, or undefined. */
  const kept = (key: string): unknown => picks.now[key]?.value ?? undefined;

  // The person's edits: what the hub kept wins over the draft, so a reload
  // or a revision draws them as they stood; once they edit, their own.
  let aim = $state("");
  let stages = $state<Stage[]>([]);
  let keptIds = $state<string[]>([]);
  let editing = false;
  $effect(() => {
    const keptAim = kept("aim");
    const keptStages = kept("stages");
    const keptDelegates = kept("delegates");
    if (editing) {
      return;
    }
    aim = typeof keptAim === "string" ? keptAim : drafted.aim;
    stages = Array.isArray(keptStages)
      ? keptStages.map((one) => stageOf(one as Record<string, unknown>))
      : drafted.stages;
    keptIds = Array.isArray(keptDelegates)
      ? keptDelegates.map(String)
      : drafted.delegates.map((one) => one.id);
  });
  // What it starts from, as drafted, kept once.
  $effect(() => {
    const shape = props.shape ? String(props.shape) : "";
    if (shape && kept("shape") === undefined) {
      bridge()?.set("shape", shape);
    }
  });

  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  /** Kept a moment after typing rests; a structural change, at once. */
  function keep(key: string, value: unknown, now = false): void {
    editing = true;
    clearTimeout(timers[key]);
    const send = () => bridge()?.set(key, value);
    if (now) {
      send();
    } else {
      timers[key] = setTimeout(send, 400);
    }
  }
  /** The stages as the hub keeps them: each one's look and hooks flat, as stages.md writes them. */
  const stored = (list: Stage[]) =>
    list.map(({ name, kind, icon, color, hooks }) => ({
      name,
      kind,
      ...(icon ? { icon } : {}),
      ...(color ? { color } : {}),
      ...hooks,
    }));
  function change(next: Stage[], now = true): void {
    stages = next;
    keep("stages", stored(next), now);
  }
  const at = (index: number, patch: Partial<Stage>) =>
    stages.map((one, i) => (i === index ? { ...one, ...patch } : one));
  function move(index: number, by: -1 | 1): void {
    const next = [...stages];
    const [one] = next.splice(index, 1);
    next.splice(index + by, 0, one);
    change(next);
  }
  function setDelegates(next: string[]): void {
    keptIds = next;
    keep("delegates", next, true);
  }
  const removed = $derived(
    drafted.delegates.filter((one) => !keptIds.includes(one.id))
  );
  const working = $derived(
    drafted.delegates.filter((one) => keptIds.includes(one.id))
  );
  /** The kind's word, unless the stage's own name already says it ("Done" of kind done). */
  const kindShown = (stage: Stage): string | null => {
    const word = words.kinds[stage.kind];
    return word.toLowerCase() === stage.name.trim().toLowerCase() ? null : word;
  };
</script>

<section class="flex min-w-0 flex-col gap-space-6" data-slot="setup">
  <Textarea
    aria-label={words.aim}
    data-slot="setup-aim"
    look="prose"
    oninput={(event: Event) => {
      aim = (event.currentTarget as HTMLTextAreaElement).value;
      keep("aim", aim.trim());
    }}
    value={aim}
  />

  <section
    aria-labelledby="setup-stages"
    class="@container flex min-w-0 flex-col gap-space-2"
  >
    <h2 class={sectionHeadVariants()} id="setup-stages">{words.stages}</h2>
    <!-- The list owns the columns and each row takes them (subgrid): every
         row's field ends, and its chip and More stand, on one line. Too
         narrow for the field beside the chip (a phone, a slim panel), the
         chip goes under the field and the field keeps the row. -->
    <!-- biome-ignore-start lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away. -->
    <ol
      class="m-0 grid list-none grid-cols-(--stage-cols) gap-x-space-2 gap-y-space-1 p-0 @max-field-group:grid-cols-(--stage-cols-narrow)"
      role="list"
      style:--stage-cols="var(--c-mark) minmax(0, 1fr) auto auto"
      style:--stage-cols-narrow="var(--c-mark) minmax(0, 1fr) auto"
    >
      <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
      {#each stages as stage, index (index)}
        {@const Glyph = stage.icon ? STAGE_GLYPHS[stage.icon] : null}
        {@const label = stage.name || words.newStage}
        {@const shown = kindShown(stage)}
        <li
          class="col-span-full grid min-w-0 grid-cols-subgrid items-center rounded-md bg-surface-recess px-space-2 py-space-2"
          data-kind={stage.kind}
          data-slot="setup-stage"
        >
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label={words.lookOf(label)}>
              {#snippet child({ props: trigger })}
                <!-- The mark is the house icon tile, as the menu's trigger. -->
                <button
                  {...trigger}
                  class={iconTileVariants({
                    class:
                      "press-tint border-0 p-0 text-(--stage-hue) focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)",
                  })}
                  style:--stage-hue={stage.color
                    ? STAGE_HUES[stage.color]
                    : "var(--ink-muted)"}
                  type="button"
                >
                  {#if stage.kind === "you"}
                    <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
                  {:else if Glyph}
                    <Glyph class="size-icon-md" />
                  {:else}
                    <IconNotYet class="size-icon-md" />
                  {/if}
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" width="regular">
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger
                  ><span>{words.glyph}</span></DropdownMenu.SubTrigger
                >
                <DropdownMenu.SubContent>
                  <DropdownMenu.RadioGroup
                    onValueChange={(next) =>
                      change(at(index, { icon: next as StageIcon }))}
                    value={stage.icon ?? ""}
                  >
                    {#each STAGE_ICONS as icon (icon)}
                      {@const Mark = STAGE_GLYPHS[icon]}
                      <DropdownMenu.RadioItem value={icon}>
                        <Mark />
                        <span>{stageLookWords.icons[icon]}</span>
                      </DropdownMenu.RadioItem>
                    {/each}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger
                  ><span>{words.color}</span></DropdownMenu.SubTrigger
                >
                <DropdownMenu.SubContent>
                  <DropdownMenu.RadioGroup
                    onValueChange={(next) =>
                      change(
                        at(index, {
                          color: next ? (next as StageColor) : undefined,
                        })
                      )}
                    value={stage.color ?? ""}
                  >
                    <DropdownMenu.RadioItem value="">
                      <span>{words.noColor}</span>
                    </DropdownMenu.RadioItem>
                    {#each STAGE_COLORS as color (color)}
                      <DropdownMenu.RadioItem value={color}>
                        <span
                          aria-hidden="true"
                          class="size-icon-sm rounded-pill bg-(--swatch)"
                          data-box
                          style:--swatch={STAGE_HUES[color]}
                        ></span>
                        <span>{stageLookWords.colors[color]}</span>
                      </DropdownMenu.RadioItem>
                    {/each}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <Input
            aria-label={words.stageName(index + 1)}
            data-slot="setup-stage-name"
            oninput={(event: Event) =>
              change(
                at(index, {
                  name: (event.currentTarget as HTMLInputElement).value,
                }),
                false
              )}
            placeholder={words.newStage}
            value={stage.name}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger aria-label={words.kindOf(label)}>
              {#snippet child({ props: trigger })}
                <!-- The kind is a setting chip, worded only where the name doesn't say it. -->
                <button
                  {...trigger}
                  class={chipVariants({
                    variant: "setting",
                    class:
                      "justify-self-end @max-field-group:col-start-2 @max-field-group:row-start-2 @max-field-group:mt-space-1 @max-field-group:justify-self-start",
                  })}
                  type="button"
                >
                  {#if stage.kind === "you"}
                    <IconNeedsYou class="text-status-attn-glyph" />
                  {/if}
                  {#if shown}
                    <span data-slot="chip-label">{shown}</span>
                  {/if}
                  <IconChevronDown data-slot="chevron" />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" width="regular">
              <DropdownMenu.RadioGroup
                onValueChange={(next) =>
                  change(at(index, { kind: asKind(next) }))}
                value={stage.kind}
              >
                {#each STAGE_KINDS as kind (kind)}
                  <DropdownMenu.RadioItem value={kind}>
                    <span>{words.kinds[kind]}</span>
                  </DropdownMenu.RadioItem>
                {/each}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label={words.moreFor(label)}
              size="icon-sm"
              variant="ghost"
            >
              <IconMore />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" width="regular">
              <DropdownMenu.Item
                disabled={index === 0}
                onSelect={() => move(index, -1)}
              >
                <span>{words.earlier}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled={index === stages.length - 1}
                onSelect={() => move(index, 1)}
              >
                <span>{words.later}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onSelect={() => change(stages.filter((_, i) => i !== index))}
              >
                <span>{words.remove(label)}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          {#if stage.line}
            <span
              class="col-start-2 -col-end-1 pt-space-1 type-meta text-ink-muted"
              >{stage.line}</span
            >
          {/if}
        </li>
      {/each}
    </ol>
    <div>
      <Button
        onclick={() => change([...stages, { name: "", kind: "active" }])}
        size="sm"
        variant="ghost"
      >
        <IconPlus />
        <span>{words.addStage}</span>
      </Button>
    </div>
  </section>

  {#if drafted.delegates.length > 0}
    <section
      aria-labelledby="setup-delegates"
      class="flex min-w-0 flex-col gap-space-2"
    >
      <h2 class={sectionHeadVariants()} id="setup-delegates">
        {words.delegates}
      </h2>
      <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away. -->
      <ul class="m-0 flex list-none flex-col gap-space-1 p-0" role="list">
        {#each working as one (one.id)}
          <li
            class="grid min-w-0 grid-cols-(--row-cols) items-center gap-x-space-2 rounded-md bg-surface-recess py-space-2 ps-space-3 pe-space-1"
            data-slot="setup-delegate"
            style:--row-cols="minmax(0, 1fr) auto"
          >
            <span class="flex min-w-0 flex-col">
              <span class="flex min-w-0 flex-wrap items-baseline gap-x-space-2">
                <span class="type-label text-ink-strong">{one.name}</span>
                {#if one.runs}
                  <span class="type-meta text-ink-muted">{one.runs}</span>
                {/if}
              </span>
              <span class="type-meta text-ink-muted">{one.brief}</span>
            </span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label={words.moreFor(one.name)}
                size="icon-sm"
                variant="ghost"
              >
                <IconMore />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" width="regular">
                <DropdownMenu.Item
                  onSelect={() =>
                    setDelegates(keptIds.filter((id) => id !== one.id))}
                >
                  <span>{words.remove(one.name)}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </li>
        {/each}
      </ul>
      {#if removed.length > 0}
        <p
          class="m-0 flex flex-wrap items-center gap-space-2 type-meta text-ink-muted"
        >
          <span>{words.removed}</span>
          {#each removed as one (one.id)}
            <span class="flex items-center gap-space-1">
              <span class="text-ink-strong">{one.name}</span>
              <Button
                onclick={() => setDelegates([...keptIds, one.id])}
                size="xs"
                variant="ghost">{words.addBack}</Button
              >
            </span>
          {/each}
        </p>
      {/if}
    </section>
  {/if}
</section>
