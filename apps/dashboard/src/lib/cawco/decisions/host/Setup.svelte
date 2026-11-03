<!--
  A project's setup (the decision library's `Setup`; the project-setup
  skill): Caw drafts it as data and the person shapes it in place on the
  house's own controls, so every project's page is one design. The page's
  title is the project's name, renamed where it stands (SetupTitle, in the
  page's head), and its Send names it ("Set up <name>", Decisions).

  - What it is for: Caw's paragraph under the title, text at rest with no
    box and no label, a field only while it has focus (the house Textarea's
    `prose` look; DESIGN.md, The Caret Rule), growing a line at a time.
  - Stages: under the house's section head, one list on one grid, each row
    one line: as Apple's Reminders edits its lists, or as
    Notion edits a status property's options, while the card
    `stage-rest` is open (SetupStages, setup-look.ts).
  - Delegate types: only when Caw proposed any; one row each on the stage
    list's grid, its name and what runs it, its brief under it on every
    row, and More to remove it. A stage or type removed waits under its
    list with Add back (RemovedLine).

  The groups stand on the page's ground under their heads (`document`) or
  each in a raised card (`cards`), while the card `setup-groups` is open.

  Every change is kept through the page's bridge (`cawco.set`, hub
  setup.ts): `aim`, `stages`, `delegates` and, as drafted, `shape`; the
  name is SetupTitle's. A reload or a revision draws what the hub kept.
-->
<script lang="ts">
  import type { StageKind } from "@cawco/core/views";
  import { STAGE_COLORS, STAGE_ICONS, STAGE_KINDS } from "@cawco/core/views";
  import { setupPageWords as words } from "@cawco/core/words/onboarding";
  import type { Snippet } from "svelte";
  import Card from "#lib/components/ui/card/card.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconMore, IconSubagents } from "#lib/icons.js";
  import { STAGE_GLYPHS, STAGE_HUES } from "../../tasks/stage-look";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge, picks } from "./page.svelte.js";
  import RemovedLine from "./setup/RemovedLine.svelte";
  import SetupStages from "./setup/SetupStages.svelte";
  import { LIST_CLASS, type Stage } from "./setup/stage";
  import { setupLook } from "./setup-look";

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
  /** Caw's stages the person removed, each with its place in his draft, to put back. */
  const gone = $derived(
    drafted.stages
      .map((stage, at) => ({ stage, at }))
      .filter(({ stage }) => !stages.some((one) => one.name === stage.name))
  );
  /** The stage that runs a type: its row wears that stage's mark. */
  const runner = (id: string): Stage | undefined =>
    stages.find((one) => one.hooks?.runs === id);
  const look = setupLook();
</script>

{#snippet aimField()}
  <Textarea
    aria-label={words.aim}
    data-slot="setup-aim"
    look="prose"
    measure="reading"
    oninput={(event: Event) => {
      aim = (event.currentTarget as HTMLTextAreaElement).value;
      keep("aim", aim.trim());
    }}
    value={aim}
  />
{/snippet}

{#snippet stageList()}
  <h2 class={sectionHeadVariants()} id="setup-stages">{words.stages}</h2>
  <SetupStages look={look.stages} onchange={change} {stages} />
  <RemovedLine
    names={gone.map(({ stage, at }) => ({ key: String(at), name: stage.name }))}
    onback={(key) => {
      const one = gone.find(({ at }) => String(at) === key);
      if (one) {
        const next = [...stages];
        next.splice(Math.min(one.at, next.length), 0, one.stage);
        change(next);
      }
    }}
  />
{/snippet}

{#snippet delegateList()}
  <h2 class={sectionHeadVariants()} id="setup-delegates">
    {words.delegates}
  </h2>
  <!-- The stage list's grid and surface: a 26px mark, the words, one 30px
       More; every type has a brief, so every row is two lines (`c-row-h-two`). -->
  <!-- biome-ignore-start lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away. -->
  <ul
    class="{LIST_CLASS} grid-cols-(--row-cols)"
    role="list"
    style:--row-cols="var(--c-mark) minmax(0, 1fr) var(--c-btn-h-sm)"
  >
    <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
    {#each working as one (one.id)}
      {@const by = runner(one.id)}
      {@const Glyph = by?.icon ? STAGE_GLYPHS[by.icon] : IconSubagents}
      <!-- mark-line: the mark stands centred on the row's two lines, beside no single run of words. -->
      <li
        class="col-span-full grid min-h-c-row-h-two min-w-0 grid-cols-subgrid items-center px-space-1"
        data-slot="setup-delegate"
      >
        <span
          aria-hidden="true"
          class={iconTileVariants({ class: "text-(--stage-hue)" })}
          data-box
          style:--stage-hue={by?.color
            ? STAGE_HUES[by.color]
            : "var(--ink-muted)"}><Glyph class="size-icon-md" /></span
        >
        <span class="flex min-w-0 flex-col">
          <span class="flex min-w-0 items-baseline gap-x-space-2">
            <span class="truncate type-label text-ink-row">{one.name}</span>
            {#if one.runs}
              <span class="truncate type-meta text-ink-muted">{one.runs}</span>
            {/if}
          </span>
          <span class="truncate type-meta text-ink-muted">{one.brief}</span>
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
            <!-- Its whole brief, which its row cuts to one line. -->
            <DropdownMenu.Label kind="line">{one.brief}</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onSelect={() =>
                setDelegates(keptIds.filter((id) => id !== one.id))}
              variant="destructive"
            >
              <span>{words.remove(one.name)}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </li>
    {/each}
  </ul>
  <RemovedLine
    names={removed.map((one) => ({ key: one.id, name: one.name }))}
    onback={(id) => setDelegates([...keptIds, id])}
  />
{/snippet}

{#snippet framedOr(framed: boolean, head: string, part: Snippet)}
  {#if framed}
    <Card>
      <section
        aria-labelledby={head}
        class="flex min-w-0 flex-col gap-space-3 px-space-3 @field-group:px-space-5"
      >
        {@render part()}
      </section>
    </Card>
  {:else}
    <section aria-labelledby={head} class="flex min-w-0 flex-col gap-space-2">
      {@render part()}
    </section>
  {/if}
{/snippet}

<section class="@container flex min-w-0 flex-col gap-space-6" data-slot="setup">
  {#if look.groups === "cards"}
    <Card
      ><div class="px-space-3 @field-group:px-space-5">
        {@render aimField()}
      </div></Card
    >
  {:else}
    {@render aimField()}
  {/if}
  <!-- On a desk (the page's own tab, a wide panel) the stages and the
       types they run stand side by side, their tops on one line; narrower,
       the types follow the stages. -->
  <div
    class="grid min-w-0 items-start gap-space-6 @desk:grid-cols-(--setup-cols)"
    style:--setup-cols="minmax(0, 3fr) minmax(0, 2fr)"
  >
    {@render framedOr(look.groups === "cards", "setup-stages", stageList)}
    {#if drafted.delegates.length > 0}
      {@render framedOr(
        look.groups === "cards",
        "setup-delegates",
        delegateList
      )}
    {/if}
  </div>
</section>
