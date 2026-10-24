<script lang="ts">
  /**
   * The person's presence on the rail's avatar (hub notifications.ts, read
   * through person.svelte.ts): a dot on its corner, and its menu.
   *
   * The dot is the machine row's presence dot (DESIGN.md, Identity marks):
   * here is a solid dot in `presence-online`; away is a hollow ring in
   * `presence-off`, and in `presence-away` while Appear away is on. Shape,
   * then hue; the word is the trigger's name and the menu's head (The
   * Glyph, Word, Hue Rule).
   *
   * The menu: the person's state on its first row; Appear away, the hub's
   * switch (agents go quiet and the phone gets pushes while it is on); the
   * away clock, the person's own (how long without input on any device
   * before they are away, and how far back what was held at a desk follows
   * them to the phone); the machines whose desktop can count, each turned
   * on by the person, with its state word; and this browser: its own report
   * of whether the person is at this computer (on, off, blocked, not
   * available here, with where to turn it on), and Set up this browser while
   * it has something still to ask. Nothing changes here before the hub says
   * so: a refused switch says why under it. A site setting this browser
   * blocks is named under it with where to turn it on.
   */
  import {
    AWAY_AFTER_CHOICES_MS,
    AWAY_AFTER_DEFAULT_MS,
    presenceWords,
  } from "@cawco/core";
  import { mergeProps } from "bits-ui";
  import cawcoIcon from "#lib/assets/brand/cawco-icon.png";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sidebar from "#lib/components/ui/sidebar/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { cawco } from "./client.svelte";
  import { instanceTitle } from "./home/home-state.svelte";
  import {
    allowHere,
    blockedHere,
    deskAsks,
    deskState,
    machineHere,
    person,
    setAppearAway,
    setAtComputer,
    setAwayAfter,
    setMachineCounts,
  } from "./person.svelte";

  /** HH:MM in this browser's zone. */
  const clock = (at: number | null): string | null =>
    at === null
      ? null
      : new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(at);

  const view = $derived(person.view);
  /** The chat in front, by its title, when the hub knows it. */
  const onChat = $derived.by(() => {
    if (!view?.on) {
      return null;
    }
    const row = cawco.instanceIndex.byId.get(view.on);
    return row ? instanceTitle(row) : null;
  });
  /** What the dot says: here, away, or appearing away. */
  const dot = $derived.by((): "here" | "away" | "appearing" => {
    if (view?.manual) {
      return "appearing";
    }
    return view?.state === "here" ? "here" : "away";
  });
  /** The person's state in words: the trigger's name and the menu's head. */
  const said = $derived.by(() => {
    if (!view) {
      return presenceWords.away(null);
    }
    if (view.manual) {
      return presenceWords.appearingAway(clock(view.since));
    }
    if (view.state === "here") {
      return onChat ? presenceWords.hereOn(onChat) : presenceWords.here;
    }
    return presenceWords.away(clock(view.since));
  });
  const setUp = $derived.by(() => {
    const ask = deskAsks();
    return ask.idle || ask.notify;
  });
  /** The last press's refusal, else what this browser blocks now. */
  const refusal = $derived(person.refusal ?? blockedHere());
  const devices = $derived(view?.devices ?? []);
  /** This browser's report of whether the person is at this computer. */
  const desk = $derived(person.permissions ? deskState() : "off");
  /** The away clock as the hub holds it, ms. */
  const clockMs = $derived(view?.awayAfterMs ?? AWAY_AFTER_DEFAULT_MS);
  /** The clocks offered, and the one set when it is none of them. */
  const clocks = $derived(
    [...new Set<number>([...AWAY_AFTER_CHOICES_MS, clockMs])].sort(
      (a, b) => a - b
    )
  );
</script>

<DropdownMenu.Root>
  <Tip label={said}>
    {#snippet children(tip)}
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            {...mergeProps(tip, props)}
            aria-label={presenceWords.you(said)}
            data-presence={dot}
            row="avatar"
          >
            <!-- No picture of the reader yet: Caw stands in, the brand icon
                 as a round picture, with the presence dot on its corner. -->
            <span class="relative grid flex-none place-items-center" data-box>
              <img
                alt=""
                class="size-space-5 rounded-pill outline outline-image-outline -outline-offset-1"
                height="18"
                src={cawcoIcon}
                width="18"
              />
              <span
                data-slot="presence-dot"
                aria-hidden="true"
                class={[
                  "absolute -end-px -bottom-px size-(--status-dot-size) rounded-pill ring-2 ring-surface-page transition-[background-color,box-shadow] duration-(--dur-control) ease-out",
                  dot === "here" && "bg-presence-online",
                  dot === "away" &&
                    "bg-surface-page inset-ring-1 inset-ring-presence-off",
                  dot === "appearing" &&
                    "bg-surface-page inset-ring-1 inset-ring-presence-away",
                ]}
              ></span>
            </span>
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
    {/snippet}
  </Tip>
  <DropdownMenu.Content align="start" side="top" width="wide">
    <DropdownMenu.Label data-slot="presence-state" kind="line"
      >{said}</DropdownMenu.Label
    >
    <DropdownMenu.CheckboxItem
      checked={view?.manual ?? false}
      closeOnSelect={false}
      data-slot="appear-away"
      disabled={!view || person.pending === "away"}
      onCheckedChange={(on) => setAppearAway(on)}
      >{presenceWords.appearAway}</DropdownMenu.CheckboxItem
    >
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger
        data-slot="away-clock"
        disabled={!view || person.pending === "clock"}
      >
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{presenceWords.awayAfter(Math.round(clockMs / 60_000))}</span
        >
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>
        <DropdownMenu.Group>
          <DropdownMenu.GroupHeading
            >{presenceWords.awayClock}</DropdownMenu.GroupHeading
          >
          <DropdownMenu.RadioGroup
            onValueChange={(value) => setAwayAfter(Number(value))}
            value={String(clockMs)}
          >
            {#each clocks as ms (ms)}
              <DropdownMenu.RadioItem
                closeOnSelect={false}
                data-away-after={ms}
                value={String(ms)}
                >{presenceWords.minutes(
                  Math.round(ms / 60_000)
                )}</DropdownMenu.RadioItem
              >
            {/each}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    {#if devices.length > 0}
      <DropdownMenu.Separator />
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading
          >{presenceWords.machines}</DropdownMenu.GroupHeading
        >
        {#each devices as device (device.id)}
          <DropdownMenu.CheckboxItem
            checked={device.counts}
            closeOnSelect={false}
            data-machine={device.id}
            disabled={person.pending === device.id}
            onCheckedChange={(on) => setMachineCounts(device.id, on)}
          >
            <span
              data-slot="machine-name"
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{device.name}</span
            >
            {#if device.counts}
              <span
                data-slot="machine-state"
                class="flex-none type-meta text-ink-muted"
                >{presenceWords.machineState(device.state)}</span
              >
            {/if}
          </DropdownMenu.CheckboxItem>
        {/each}
      </DropdownMenu.Group>
    {/if}
    <DropdownMenu.Separator />
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading
        >{presenceWords.thisBrowser}</DropdownMenu.GroupHeading
      >
      <!-- On or off as this browser's Idle Detection stands; blocked in the
           browser's own settings, or not in this browser at all, the switch
           can't change it and says so (its line below says where). -->
      <DropdownMenu.CheckboxItem
        checked={desk === "on"}
        closeOnSelect={false}
        data-desk={desk}
        data-slot="at-computer"
        disabled={desk === "unavailable" ||
          desk === "blocked" ||
          person.pending === "desk"}
        onCheckedChange={(on) => setAtComputer(on)}
      >
        <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{presenceWords.atComputer}</span
        >
        <span
          data-slot="at-computer-state"
          class="flex-none type-meta text-ink-muted"
          >{presenceWords.atComputerState(desk)}</span
        >
      </DropdownMenu.CheckboxItem>
      {#if desk === "unavailable"}
        <DropdownMenu.Label data-slot="at-computer-instead" kind="line"
          ><span class="text-ink-muted"
            >{presenceWords.unavailable(machineHere(), false)}</span
          ></DropdownMenu.Label
        >
      {/if}
      {#if setUp}
        <DropdownMenu.Item
          closeOnSelect={false}
          data-slot="set-up-browser"
          disabled={person.pending === "allow"}
          onSelect={() => allowHere()}>{presenceWords.setUp}</DropdownMenu.Item
        >
      {/if}
    </DropdownMenu.Group>
    {#if refusal}
      <!-- Wrapped whole: the setting's name and where to turn it on. -->
      <DropdownMenu.Label data-slot="presence-refusal" kind="line" role="alert"
        ><span class="text-status-fail-ink"
          >{refusal.title}. {refusal.message}</span
        ></DropdownMenu.Label
      >
    {/if}
  </DropdownMenu.Content>
</DropdownMenu.Root>
