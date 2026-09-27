<script lang="ts">
  /**
   * Which model answers — for a session that is running, and for one that is
   * still a form. Lists retain the harness that reported them; custom ids go
   * through verbatim for models the catalog has not learned yet.
   */
  import { tick } from "svelte";
  import ProviderLogo from "$lib/components/features/ProviderLogo.svelte";
  import { Button, type ButtonSize } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Command from "$lib/components/ui/command";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "$lib/components/ui/popover";
  import { IconRefresh, IconUnfold } from "$lib/icons";
  import {
    covers,
    ensureModels,
    MODEL_DEFAULT,
    modelLabel,
    models,
    refreshModels,
    rememberModel,
  } from "./models.svelte";

  let {
    value,
    harness,
    onchoose,
    showDefault = false,
    size = "sm",
    class: className = "",
  }: {
    /** The model in force, as the id it is known by. `''` is the SDK's own choice. */
    value: string;
    harness?: string;
    /** Chosen. Rejections belong to the caller — it owns the slot they show in. */
    onchoose: (model: string) => void | Promise<void>;
    /** Whether "Default" is offered — it is, wherever no model at all is a choice. */
    showDefault?: boolean;
    size?: ButtonSize;
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
  const askable = $derived(models.askableFor(harness));
  // Legacy recent ids have no harness provenance; keep them out of scoped pickers.
  const recent = $derived(harness ? [] : models.recent);
  /** A typed id nothing on the list already covers — the whole point of the field. */
  const custom = $derived(
    trimmed.length > 0 &&
      !offered.some((row) => covers(row, trimmed)) &&
      !recent.includes(trimmed)
  );

  /** Why the list is thin, when it is — said under it rather than as a fake row. */
  const note = $derived.by(() => {
    if (models.error !== null) {
      return models.error;
    }
    if (models.loading) {
      return "Asking a running session what it offers…";
    }
    if (offered.length === 0) {
      return "No list yet — refresh it through a running session, or type an id.";
    }
    return null;
  });

  function opened(next: boolean) {
    if (next) {
      ensureModels(harness);
    } else {
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
      rememberModel(model);
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

  // The picker says for itself why a refresh failed; it is about the list, not
  // about the session, so it never reaches the page's error slot — and the
  // popover stays open, because the point was to look at what came back.
  //
  // This catch is deliberately bare, and is the log-only side of the boundary:
  // a background refresh that fails leaves the combobox showing the last-known
  // list and reopening it retries. Nothing the operator asked for is lost, so
  // there is nothing to report. It is NOT the class of swallowed rejection that
  // ate every send from a plain-http origin — that one sat on a user action.
  const refresh = () =>
    // biome-ignore lint/complexity/noVoid: the refresh is fire-and-forget by intent — see the comment above
    void refreshModels(harness).catch(() => {
      // Log-only boundary: the popover already shows the last-known list.
    });
</script>

<Popover.Root onOpenChange={opened} bind:open>
  <Popover.Trigger bind:ref={triggerRef}>
    {#snippet child({ props })}
      <Button
        {...props}
        aria-expanded={open}
        aria-label={unreported ? 'Model, not reported yet' : 'Model'}
        class="justify-between gap-2 {className}"
        role="combobox"
        {size}
        title={unreported
          ? "Read from this session's next turn — it has not said which model answers"
           : value || 'The model the harness picks for itself'}
        variant="outline"
      >
        <span class="truncate"
          >{unreported ? '—' : modelLabel(value, harness)}</span
        >
        <!-- 14px: the inline-with-text icon size the session bar settled on,
             so this unfold mark matches the one on the disclosure trigger. -->
        <IconUnfold class="size-3.5 shrink-0 opacity-50" />
      </Button>
    {/snippet}
  </Popover.Trigger>

  <Popover.Content align="start" class="w-80 p-0">
    <Command.Root>
      <Command.Input
        placeholder="Search, or type a model id…"
        bind:value={typed}
      />
      <Command.List>
        {#if custom}
          <Command.Group forceMount heading="Custom">
            <Command.Item forceMount onSelect={selectCustom} value={trimmed}>
              <ProviderLogo model={trimmed} />
              <span class="flex flex-col">
                <span>Use <span class="font-mono">{trimmed}</span></span>
                <span class="text-meta text-muted-foreground">
                  Sent to the selected harness exactly as typed
                </span>
              </span>
            </Command.Item>
          </Command.Group>
        {/if}

        {#if !custom}
          <Command.Empty>No model here goes by that.</Command.Empty>
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
                <span class="truncate font-mono text-meta">{id}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        <Command.Group heading="Models">
          {#if showDefault}
            <Command.Item
              data-checked={value === MODEL_DEFAULT}
              keywords={['default']}
              onSelect={selectDefault}
              value="default-model"
            >
              <span class="flex flex-col">
                <span>Default</span>
                <span class="text-meta text-muted-foreground">
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
              <span class="flex flex-col">
                <span>{row.displayName}</span>
                <span class="text-meta text-muted-foreground"
                  >{row.description}</span
                >
              </span>
            </Command.Item>
          {/each}
        </Command.Group>

        <Command.Separator />
        <Command.Group>
          <Command.Item
            disabled={!askable || models.loading}
            forceMount
            onSelect={refresh}
            title={askable
              ? 'Ask a running session of this harness what models it offers'
              : 'A session has to be running to ask what models it offers.'}
            value="refresh-models"
          >
            <IconRefresh />
            Refresh models
          </Command.Item>
        </Command.Group>
      </Command.List>

      {#if note}
        <p
          class="border-t border-foreground/5 px-3 py-2 text-meta {models.error
            ? 'text-error'
            : 'text-muted-foreground'}"
          role={models.error ? 'alert' : undefined}
        >
          {note}
        </p>
      {/if}
    </Command.Root>
  </Popover.Content>
</Popover.Root>
