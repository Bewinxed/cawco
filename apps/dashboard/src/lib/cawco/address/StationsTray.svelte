<script lang="ts" module>
  /** The five stations, in the order the set-up runs them. */
  type Station = "join" | "address" | "secure" | "keep" | "phone";
</script>

<script lang="ts">
  import { LEDGE_LINE } from "#lib/cawco/home/Caw.svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronDown,
    IconChevronRight,
    IconClose,
    IconError,
    IconExternal,
    IconNeutral,
    IconNotYet,
    IconSuccess,
  } from "#lib/icons.js";
  import AddressList from "./AddressList.svelte";
  import Confetti from "./Confetti.svelte";
  import { arrive, depart } from "./motion";
  import StateObject from "./StateObject.svelte";
  import TrayCaw from "./TrayCaw.svelte";
  import TrayDetails from "./TrayDetails.svelte";
  import { type AddressTray, dateOf, EXPIRES, type Step } from "./tray.svelte";
  /**
   * Direction C: stations that tick, the live one open (design 6ddc57c4,
   * Option C; Vercel's deployment card, Laravel Cloud's grouped steps).
   * Caw leads it as he leads the other two: at 64px behind the tray's top
   * edge, over the title's start, reacting to the live station. The tray's
   * title is the live station's own ("Waiting for your sign-in", "Open it
   * on your phone, once", a failure's what-happened), and the station that
   * is open holds its words, its object and its action under it. A station
   * passed is one line with its tick; the stations not reached yet are one
   * line together ("Then Address · Secure · Phone") until each is reached,
   * so the tray never reads as a checklist. A failure stands inside the
   * station that failed, in RowFault's shape (the way out, Show details),
   * the title saying what happened. Once live a last part says so, with
   * every address and Done; an optional station not done stays a line that
   * reopens it. The tray's height is its rows', carried by morph over
   * --dur-pop on the drawer curve.
   */
  import Words from "./Words.svelte";
  import {
    type Form,
    factsFor,
    failureWords,
    rawFor,
    stateWords,
  } from "./words";

  let {
    tray,
    form,
    ref = $bindable(null),
  }: { tray: AddressTray; form: Form; ref?: HTMLElement | null } = $props();

  const CAW = 64;
  /** Caw's box starts where the title does on a desk: the tray's padding and the body's. */
  const CAW_START =
    "calc(var(--radius-modal) - var(--radius-lg) + var(--space-4))";
  /** A station's line: its mark, its name, where it stands, its chevron. */
  const STATION_COLS = "var(--icon-md) auto minmax(0, 1fr) var(--icon-md)";
  /** An open station's words start where its name does: past the mark and the line's padding. */
  const STATION_INDENT = "calc(var(--icon-md) + var(--space-2) * 2)";
  const ORDER: Station[] = ["join", "address", "secure", "keep", "phone"];
  const NAMES: Record<Station, string> = {
    join: "Join",
    address: "Address",
    secure: "Secure",
    keep: "Keep",
    phone: "Phone",
  };
  /** The step a station's Facts are read at. */
  const STEP_OF: Record<Station, Step> = {
    join: "found",
    address: "checking",
    secure: "secure",
    keep: "keep",
    phone: "phone",
  };

  const words = $derived(stateWords(tray, form));
  const titleId = $props.id();

  /** The station the set-up stands at; on a failure, the one that failed. */
  const current = $derived.by((): Station | null => {
    switch (tray.step) {
      case "found":
      case "signin":
      case "admin":
      case "key":
        return "join";
      case "checking":
        return "address";
      case "secure":
      case "keep":
      case "phone":
        return tray.step;
      case "failed":
        if (tray.cause === "no-answer") {
          return "address";
        }
        return tray.cause === "certs-off" ? "secure" : "join";
      case "finding":
      case "live":
      case "unsupported":
        return null;
    }
  });
  const live = $derived(tray.step === "live");
  const rows = $derived(tray.step !== "finding" && tray.step !== "unsupported");

  type StationState = "done" | "skipped" | "open" | "failed" | "todo";

  /** A station this network offers at all: Secure where it issues certificates, Keep where its device expires. */
  function applies(station: Station): boolean {
    if (station === "secure") {
      return tray.issuesCerts;
    }
    return station === "keep" ? tray.expires : true;
  }

  /** Whether a station passed was done, or passed by (an optional one, or one the network doesn't offer). */
  const PASSED: Record<Station, () => "done" | "skipped"> = {
    join: () => "done",
    address: () => "done",
    secure: () => (tray.certs && tray.issuesCerts ? "done" : "skipped"),
    keep: () => (tray.expiryOff ? "done" : "skipped"),
    phone: () => (tray.phoneOpened ? "done" : "skipped"),
  };

  /** A station's state: done, skipped (an optional one passed), open, failed, or not reached. */
  function stateOf(station: Station): StationState {
    const at = ORDER.indexOf(station);
    const now = current ? ORDER.indexOf(current) : ORDER.length;
    if (!live && at === now) {
      return tray.step === "failed" ? "failed" : "open";
    }
    if (!(live || at < now)) {
      return "todo";
    }
    return applies(station) ? PASSED[station]() : "skipped";
  }

  /** What a station says on a network that doesn't offer it. */
  const NONE: Record<
    "secure" | "keep",
    Record<"headscale" | "netbird", string>
  > = {
    secure: {
      headscale: "Headscale gives no certificates yet",
      netbird: "NetBird gives no certificates",
    },
    keep: {
      headscale: "No expiry: the server sets none",
      netbird: "A setup key's peer never expires",
    },
  };

  /** One line of where each station stands, by its state. */
  const LINES: Record<Station, (state: StationState) => string> = {
    join: (state) => {
      if (state === "done") {
        return `${tray.facts.domain}, as ${tray.name}`;
      }
      return tray.network === "netbird"
        ? "Paste a setup key"
        : `Sign in on ${tray.facts.name}`;
    },
    address: (state) =>
      state === "done"
        ? `${tray.bareWordWorks ? tray.short : `http://${tray.long}`} answers`
        : "CawCo checks it answers from here",
    secure: (state) => {
      if (tray.network !== "tailscale") {
        return NONE.secure[tray.network];
      }
      if (state === "done") {
        return `https://${tray.long}`;
      }
      return state === "skipped" ? "Not yet: certificates are off" : "Optional";
    },
    keep: (state) => {
      if (tray.network !== "tailscale") {
        return NONE.keep[tray.network];
      }
      if (state === "done") {
        return "Expiry off";
      }
      return state === "skipped"
        ? `Expires ${dateOf(EXPIRES)}`
        : "180 days, unless expiry is off";
    },
    phone: (state) => {
      if (state === "done") {
        return "Your phone opened it";
      }
      return state === "skipped" ? "Not yet" : "Once, from here";
    },
  };

  /** The stations not reached yet that this network offers, said together on one line. */
  const ahead = $derived(
    ORDER.filter((one) => stateOf(one) === "todo" && applies(one))
  );

  /** A done station's own Facts, unfolded in its row. */
  let shown = $state<Station | null>(null);

  function press(station: Station, state: StationState): void {
    const optional =
      station === "secure" || station === "keep" || station === "phone";
    if (live && optional && state === "skipped" && applies(station)) {
      tray.reopen(station);
      return;
    }
    shown = shown === station ? null : station;
  }
</script>

<section
  bind:this={ref}
  aria-labelledby={titleId}
  class="relative grid min-w-0"
  data-form={form}
  data-step={tray.step}
  data-tray="stations"
  {@attach (node) => morph({ ms: dur("--dur-pop") })(node)}
>
  <!-- Caw's room over the top edge, over the title's start: he stands
       behind the edge, leading the tray, and never moves. -->
  <div
    class={[
      "flex h-(--caw-room) justify-start",
      form === "desk" ? "ps-(--caw-start)" : "ps-space-4",
    ]}
    data-tray-rise
    style:--caw-room="{CAW * LEDGE_LINE}px"
    style:--caw-start={CAW_START}
  >
    <TrayCaw ledge pose={tray.pose.pose} size={CAW} />
  </div>
  <div
    style:--tray-pad="calc(var(--radius-modal) - var(--radius-lg))"
    class={[
      "relative min-w-0",
      form === "desk"
        ? "rounded-modal bg-surface-recess p-(--tray-pad) shadow-overlay"
        : "rounded-t-lg border-t border-border-hairline bg-surface-raised shadow-drawer",
    ]}
    data-slot="surface"
  >
    <div
      class={[
        "relative grid min-w-0 gap-space-3 bg-surface-raised",
        form === "desk"
          ? "rounded-lg p-space-4"
          : "max-h-(--sheet-room) overflow-y-auto overscroll-contain rounded-t-lg px-space-4 pb-safe-space-4",
      ]}
      data-slot="body"
    >
      {#if form === "phone"}
        <div aria-hidden="true" class={grabberVariants()}></div>
      {/if}
      <div class="grid min-w-0 gap-space-3" data-tray-content>
        <!-- The live station's title, ×. -->
        <div
          class="grid grid-cols-(--head-cols) items-start gap-x-space-3"
          style:--head-cols="minmax(0, 1fr) auto"
        >
          <h2
            id={titleId}
            class="m-0 min-w-0 type-title tracking-title text-balance text-ink-strong"
            data-slot="title"
          >
            <MorphText text={words.title} wrap />
          </h2>
          <Button
            aria-label="Close"
            class="-me-space-2"
            icon={IconClose}
            onclick={() => tray.park()}
            size="icon-sm"
            variant="ghost"
          />
        </div>
        {#if tray.step === "finding"}
          <p
            class="mark-line m-0 flex items-start gap-space-2 type-meta text-ink-muted"
          >
            <span class="mark-cell"><LiveDot /></span>
            <span class="mark-text">Looking at this computer's networks…</span>
          </p>
        {:else if tray.step === "unsupported"}
          <div class="grid gap-space-3" in:arrive>
            {#each words.lines as line (line)}
              <p class="m-0 type-body text-pretty text-ink-muted">
                <Words text={line} />
              </p>
            {/each}
            <span class="flex justify-end">
              <Button
                label="Close"
                onclick={() => tray.park()}
                variant="outline"
              />
            </span>
            <TrayDetails
              bind:open={tray.details}
              facts={factsFor(tray)}
              raw={rawFor(tray)}
              {tray}
            />
          </div>
        {/if}
        {#if rows}
          <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
          <ol class="m-0 grid list-none p-0" data-slot="stations" role="list">
            <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
            {#each ORDER as station, index (station)}
              {@const state = stateOf(station)}
              {@const open = state === "open" || state === "failed"}
              {#if state !== "todo"}
                <li
                  class="grid min-w-0 border-t border-t-border-hairline first:border-t-0"
                  data-station={station}
                  data-state={state}
                >
                  <!-- The station's line: its mark, its name, where it stands, and
                   (closed) a press that opens its facts or, once live, an
                   optional station not done. -->
                  <button
                    aria-expanded={open || shown === station}
                    class="mark-line press-tint focus-inset group/station grid min-h-c-row-h grid-cols-(--station-cols) items-center gap-x-space-2 rounded-sm px-space-2 text-start enabled:hover:bg-surface-hover disabled:cursor-default"
                    disabled={open}
                    onclick={() => press(station, state)}
                    style:--station-cols={STATION_COLS}
                    type="button"
                  >
                    <span
                      class="mark-cell grid size-icon-md place-items-center"
                      data-box
                    >
                      {#if state === "done"}
                        <IconSuccess
                          aria-label="Done"
                          class="size-icon-md text-status-done-ink"
                        />
                      {:else if state === "failed"}
                        <IconError
                          aria-label="Failed"
                          class="size-icon-md text-status-fail-ink"
                        />
                      {:else if state === "skipped"}
                        <IconNeutral
                          aria-label="Not done"
                          class="size-icon-md text-ink-muted"
                        />
                      {:else if state === "open" && tray.waiting}
                        <LiveDot />
                      {:else}
                        <span
                          class={[
                            "box-border grid size-icon-md place-items-center rounded-pill border type-meta leading-none num before:content-data-n",
                            state === "open"
                              ? "border-brand-solid text-brand-ink"
                              : "border-border-control text-ink-muted",
                          ]}
                          aria-hidden="true"
                          data-n={index + 1}
                        ></span>
                      {/if}
                    </span>
                    <span class="type-label text-ink-strong"
                      >{NAMES[station]}</span
                    >
                    <span
                      class="min-w-0 overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-muted"
                      title={LINES[station](state)}
                      >{open ? "" : LINES[station](state)}</span
                    >
                    <span
                      data-box
                      class="grid size-icon-md place-items-center text-ink-muted"
                    >
                      {#if open || shown === station}
                        <IconChevronDown
                          aria-hidden="true"
                          class="size-icon-md"
                        />
                      {:else}
                        <IconChevronRight
                          aria-hidden="true"
                          class="size-icon-md"
                        />
                      {/if}
                    </span>
                  </button>
                  {#if state === "failed"}
                    {@const said = failureWords(tray, tray.cause)}
                    <div
                      class="grid gap-space-2 ps-(--station-indent) pe-space-2 pb-space-3"
                      style:--station-indent={STATION_INDENT}
                      transition:unfold
                    >
                      <RowFault
                        again={() => tray.wayOut()}
                        againLabel={said.button}
                        againPending="Working…"
                        details={rawFor(tray)}
                        reason={said.line}
                      />
                    </div>
                  {:else if state === "open"}
                    <div
                      class="grid min-w-0 gap-space-3 ps-(--station-indent) pe-space-2 pb-space-3"
                      style:--station-indent={STATION_INDENT}
                      transition:unfold
                    >
                      <div class="relative grid min-w-0">
                        {#key `${tray.view}:${tray.network}`}
                          <div
                            class="grid min-w-0 gap-space-3"
                            in:arrive
                            out:depart
                          >
                            {#each words.lines as line (line)}
                              <p
                                class="m-0 type-body text-pretty text-ink-muted"
                              >
                                <Words text={line} />
                              </p>
                            {/each}
                            <StateObject {form} {tray} />
                            {#if words.meta}
                              <p
                                class="mark-line m-0 flex min-w-0 flex-wrap items-start gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
                              >
                                <span class="mark-cell">
                                  {#if words.meta.live}
                                    <LiveDot />
                                  {:else}
                                    <IconSuccess
                                      aria-hidden="true"
                                      class="size-icon-sm text-status-done-ink"
                                    />
                                  {/if}
                                </span>
                                <span class="mark-text min-w-0"
                                  ><MorphText text={words.meta.text} /></span
                                >
                                {#if words.meta.action}
                                  <Button
                                    data-box
                                    label={words.meta.action.label}
                                    onclick={words.meta.action.act}
                                    size="xs"
                                    variant="link"
                                  />
                                {/if}
                              </p>
                            {/if}
                          </div>
                        {/key}
                      </div>
                      {#if words.primary}
                        <div
                          class={form === "desk"
                            ? "flex flex-wrap justify-end gap-space-2"
                            : "grid gap-space-2"}
                        >
                          {#if words.secondary}
                            <Button
                              data-icon={words.secondary.away
                                ? "inline-end"
                                : undefined}
                              onclick={words.secondary.act}
                              size={form === "phone" ? "lg" : "default"}
                              variant="outline"
                            >
                              <MorphText text={words.secondary.label} />
                              {#if words.secondary.away}<IconExternal
                                  aria-hidden="true"
                                />{/if}
                            </Button>
                          {/if}
                          <Button
                            data-icon={words.primary.away
                              ? "inline-end"
                              : undefined}
                            data-tray-primary
                            disabled={words.primary.disabled}
                            onclick={words.primary.act}
                            size={form === "phone" ? "lg" : "default"}
                          >
                            <MorphText text={words.primary.label} />
                            {#if words.primary.away}<IconExternal
                                aria-hidden="true"
                              />{/if}
                          </Button>
                        </div>
                      {/if}
                      <TrayDetails
                        bind:open={tray.details}
                        facts={factsFor(tray)}
                        raw={rawFor(tray)}
                        {tray}
                      />
                    </div>
                  {:else if shown === station}
                    <!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list). -->
                    <ul
                      class="m-0 grid list-none gap-space-2 ps-(--station-indent) pe-space-2 pb-space-3"
                      role="list"
                      style:--station-indent={STATION_INDENT}
                      transition:unfold
                    >
                      <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
                      {#each factsFor(tray, STEP_OF[station]) as fact (fact.text)}
                        <li class="type-meta text-ink-muted">
                          <Words text={fact.text} />
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/if}
            {/each}
            {#if ahead.length > 0}
              <!-- The stations not reached yet: one line together, each
                 opening as it is reached. -->
              <li
                class="mark-line grid min-h-c-row-h grid-cols-(--station-cols) items-center gap-x-space-2 border-t border-t-border-hairline px-space-2 type-meta text-ink-muted"
                data-slot="ahead"
                style:--station-cols={STATION_COLS}
              >
                <span
                  class="mark-cell grid size-icon-md place-items-center"
                  data-box
                >
                  <IconNotYet class="size-icon-md text-ink-subtle" />
                </span>
                <span class="col-start-2 col-end-4 min-w-0"
                  >Then {ahead.map((one) => NAMES[one]).join(" · ")}</span
                >
              </li>
            {/if}
          </ol>
        {/if}
        {#if live}
          <div
            class="grid min-w-0 gap-space-3 border-t border-t-border-hairline pt-space-3"
            in:arrive
          >
            <p class="m-0 type-body text-ink-muted">
              On any device signed in to {tray.facts.domain}.
            </p>
            <AddressList {tray} />
            <div class={form === "desk" ? "flex justify-end" : "grid"}>
              <Button
                data-tray-primary
                label="Done"
                onclick={() => tray.finish()}
                size={form === "phone" ? "lg" : "default"}
              />
            </div>
            <TrayDetails
              bind:open={tray.details}
              facts={factsFor(tray)}
              raw={rawFor(tray)}
              {tray}
            />
          </div>
        {/if}
      </div>
      {#if tray.firstLive && live}
        <Confetti />
      {/if}
    </div>
  </div>
</section>
