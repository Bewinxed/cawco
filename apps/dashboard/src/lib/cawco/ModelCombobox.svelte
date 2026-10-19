<script lang="ts">
  /**
   * Which model answers — for a session that is running, and for one that is
   * still a form. Lists retain the harness that reported them; custom ids go
   * through verbatim for models the catalog has not learned yet.
   */
  import { tick } from "svelte";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import {
    Button,
    type ButtonProps,
    type ButtonSize,
  } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Command from "#lib/components/ui/command/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconUnfold } from "#lib/icons.js";
  import {
    covers,
    MODEL_DEFAULT,
    modelLabel,
    models,
    rememberModel,
  } from "./models.svelte";

  let {
    value,
    harness,
    onchoose,
    showDefault = false,
    size = "sm",
    width,
    class: className = "",
  }: {
    /** The model in force, as the id it is known by. `''` is the SDK's own choice. */
    value: string;
    harness: string;
    /** Chosen. Rejections belong to the caller — it owns the slot they show in. */
    onchoose: (model: string) => void | Promise<void>;
    /** Whether "Default" is offered — it is, wherever no model at all is a choice. */
    showDefault?: boolean;
    size?: ButtonSize;
    /** The trigger's width look, passed on to its Button. */
    width?: ButtonProps["width"];
    class?: string;
  } = $props();

  let open = $state(false);
  let typed = $state("");
  let triggerRef = $state<HTMLButtonElement | null>(null);

  /**
   * Where "Default" is not on offer, no model is not a choice anyone made — it
   * is a session that has not reported one yet, and naming a model would be
   * inventing its settings. The next `system.init` fills it in.
   */
  const unreported = $derived(!(value || showDefault));

  const trimmed = $derived(typed.trim());
  const offered = $derived(models.forHarness(harness));
  const recent = $derived(models.recentFor(harness));
  /** A typed id nothing on the list already covers — the whole point of the field. */
  const custom = $derived(
    trimmed.length > 0 &&
      !offered.some((row) => covers(row, trimmed)) &&
      !recent.includes(trimmed)
  );

  /** Why the list could not be read, said under it rather than as a fake row. */
  const unread = $derived(
    offered.length === 0 && harness ? models.unread(harness) : null
  );
  /** Why the list is empty, when it is. */
  const note = $derived(
    offered.length === 0
      ? (unread ?? "No machine has reported these models yet. Type an id.")
      : null
  );

  function opened(next: boolean) {
    if (!next) {
      typed = "";
    }
  }

  /** Keyboard users carry on through the form instead of losing focus to the body. */
  function closeAndFocusTrigger() {
    open = false;
    typed = "";
    // biome-ignore lint/complexity/noVoid: focusing the trigger after close is fire-and-forget — nothing awaits it and there is nothing to report if it fails
    void tick().then(() => triggerRef?.focus());
  }

  /** Already running it — an init names the wire id, its row is keyed by the alias. */
  const isCurrent = (model: string) =>
    model === value ||
    offered.some((row) => row.value === model && covers(row, value));

  async function choose(model: string, remember = false) {
    closeAndFocusTrigger();
    if (remember) {
      rememberModel(model, harness);
    }
    if (!isCurrent(model)) {
      await onchoose(model);
    }
  }

  // biome-ignore lint/complexity/noVoid: onSelect handlers are sync — the pick is fire-and-forget, and choose()'s own callers already own its rejection
  const selectCustom = () => void choose(trimmed, true);
  // biome-ignore lint/complexity/noVoid: onSelect handlers are sync — the pick is fire-and-forget, and choose()'s own callers already own its rejection
  const selectRecent = (id: string) => void choose(id);
  // biome-ignore lint/complexity/noVoid: onSelect handlers are sync — the pick is fire-and-forget, and choose()'s own callers already own its rejection
  const selectDefault = () => void choose(MODEL_DEFAULT);
  // biome-ignore lint/complexity/noVoid: onSelect handlers are sync — the pick is fire-and-forget, and choose()'s own callers already own its rejection
  const selectModel = (model: string) => void choose(model);
</script>

<Popover.Root onOpenChange={opened} bind:open>
  <Popover.Trigger bind:ref={triggerRef}>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-expanded={open}
        aria-label={unreported ? "Model, not reported yet" : "Model"}
        class="justify-between {className}"
        gap="loose"
        role="combobox"
        {size}
        title={unreported
          ? "Read from this session's next turn — it has not said which model answers"
          : value || "The model the harness picks for itself"}
        variant="outline"
        {width}
      >
        <span
          data-slot="num"
          class="num min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{unreported ? "—" : modelLabel(value, harness)}</span
        >
        <!-- 16px, the control size, so this unfold mark matches the one on
             the disclosure trigger. -->
        <IconUnfold class="size-icon-md shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content align="start" pad="none" width="wide">
    <Command.Root>
      <Command.Input
        placeholder="Search, or type a model id…"
        bind:value={typed}
      />
      <Command.List class="relative">
        <!-- A typed id nothing covers and "no model goes by that" take
             turns at the top of the list: they cross-fade over
             --dur-control while the popover's height follows (its morph). -->
        {#if custom}
          <div in:crossIn out:crossOut>
            <Command.Group forceMount heading="Custom">
              <Command.Item forceMount onSelect={selectCustom} value={trimmed}>
                <ProviderLogo model={trimmed} />
                <span class="flex flex-col" data-box>
                  <span>Use <span class="font-mono">{trimmed}</span></span>
                  <span class="text-meta text-ink-muted">
                    Sent to the selected harness exactly as typed
                  </span>
                </span>
              </Command.Item>
            </Command.Group>
          </div>
        {:else}
          <div in:crossIn out:crossOut>
            <Command.Empty>No model here goes by that.</Command.Empty>
          </div>
        {/if}

        {#if recent.length > 0}
          <Command.Group heading="Recently used">
            {#each recent as id (id)}
              <Command.Item
                data-checked={id === value}
                onSelect={() => selectRecent(id)}
                title={id}
                value={id}
              >
                <ProviderLogo model={id} />
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-mono text-meta"
                  >{id}</span
                >
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        <Command.Group heading="Models">
          {#if showDefault}
            <Command.Item
              data-checked={value === MODEL_DEFAULT}
              keywords={["default"]}
              onSelect={selectDefault}
              value="default-model"
            >
              <span class="flex flex-col" data-box>
                <span>Default</span>
                <span class="text-meta text-ink-muted">
                  Whatever the selected harness would have picked
                </span>
              </span>
            </Command.Item>
          {/if}
          {#each offered as row (row.value)}
            <Command.Item
              data-checked={covers(row, value)}
              keywords={[row.displayName]}
              onSelect={() => selectModel(row.value)}
              title={row.value}
              value={row.value}
            >
              <ProviderLogo model={row.value} />
              <span class="flex flex-col" data-box>
                <span>{row.displayName}</span>
                <span class="text-meta text-ink-muted">{row.description}</span>
              </span>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>

      {#if note}
        <p
          class="border-t border-ink-strong/5 px-3 py-2 text-meta {unread
            ? 'text-error-9'
            : 'text-ink-muted'}"
          role={unread ? "alert" : undefined}
        >
          {note}
        </p>
      {/if}
    </Command.Root>
  </Popover.Content>
</Popover.Root>
