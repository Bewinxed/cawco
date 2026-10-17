<script lang="ts">
  /**
   * The fleet with no machine to run a session on, where the board would
   * be (the wide screen's empty detail, the phone's home). In the shape of
   * New project: Caw at 80px over a title and one line.
   *
   * - `none`, no machine registered: the two ways in as icon cards, each
   *   opening the Connect a machine dialog on its tab.
   * - `offline`, machines registered and none online: one line and Check
   *   machines, which opens the top bar's Machines popover, where they are
   *   listed greyed.
   *
   * It enters with Caw's own enter and the cards in the list stagger
   * (motion/list-swap); from one state to the other the words cross-fade.
   * With `present` off the words fade and Caw leaves; `ongone` says when he
   * has, and the place lets it go.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { barGlass } from "./bar-glass.svelte";
  import Caw from "./home/Caw.svelte";
  import { addMachine, JOIN_WAYS } from "./join/join.svelte";
  import { crossIn, crossOut } from "./motion/curves.svelte";
  import { ListSwap } from "./motion/list-swap.svelte";
  import CardFace from "./project/CardFace.svelte";

  let {
    fleet,
    present = true,
    ongone,
  }: {
    /** No machine registered, or none of them online. */
    fleet: "none" | "offline";
    /** Off: the words fade and Caw leaves; `ongone` says when he has. */
    present?: boolean;
    ongone?: () => void;
  } = $props();

  /** Caw's side, as on New project. */
  const CAW_SIZE = 80;

  /** The cards come in by the list stagger, once, as the state first shows. */
  const enter = new ListSwap(true);
</script>

<!-- literal: 34rem, 26rem, 80px -->
<div
  class="group mx-auto flex w-full max-w-(--measure) flex-col items-center gap-space-4"
  data-leaving={!present || undefined}
  style:--measure="34rem"
>
  <div
    data-slot="caw-80"
    class="grid min-h-(--caw-min) place-items-center"
    style:--caw-min="80px"
  >
    <Caw
      next={["ready", "idle"]}
      {ongone}
      {present}
      size={CAW_SIZE}
      status={fleet === "none" ? "ready" : "idle"}
    />
  </div>
  <!-- The states share this cell: the one leaving is pinned in it (crossOut). -->
  <div
    data-slot="body"
    class="relative w-full transition-[opacity] dur-fade ease-out group-data-leaving:opacity-0"
  >
    {#key fleet}
      <!-- mark-line: a column; the machine cards stand under the words -->
      <div
        data-slot="words"
        class="flex flex-col items-center gap-space-4"
        in:crossIn
        out:crossOut
      >
        {#if fleet === "none"}
          <h1
            data-slot="title"
            class="m-0 type-title text-center text-balance text-ink-strong"
          >
            Connect a machine to run sessions
          </h1>
          <p
            class="m-0 max-w-(--line-max) type-body text-center text-pretty text-ink-muted"
            style:--line-max="26rem"
          >
            Sessions run on your own machines. Install CawCo on one and it joins
            this fleet.
          </p>
          <div
            class="mt-space-4 w-full"
            {@attach highlight({
              rows: ".icon-card",
              selected: ".icon-card[data-open]",
              axis: "xy",
            })}
          >
            {#each JOIN_WAYS as card, index (card.way)}
              <button
                aria-haspopup="dialog"
                class="icon-card animate-(--row-anim)"
                data-open={addMachine.open && addMachine.way === card.way
                  ? ""
                  : undefined}
                onclick={() => addMachine.show(card.way)}
                type="button"
                style:--row-anim={enter.rowAnim(index)}
              >
                <CardFace
                  hue={card.hue}
                  icon={card.icon}
                  meta={card.meta}
                  name={card.name}
                />
              </button>
            {/each}
          </div>
        {:else}
          <h1
            data-slot="title"
            class="m-0 type-title text-center text-balance text-ink-strong"
          >
            None of your machines are online
          </h1>
          <p
            class="m-0 max-w-(--line-max) type-body text-center text-pretty text-ink-muted"
            style:--line-max="26rem"
          >
            Sessions run on a machine that is online. See which ones dropped and
            why.
          </p>
          <Button
            aria-haspopup="dialog"
            onclick={() => {
              barGlass.open = "machines";
            }}
          >
            Check machines
          </Button>
        {/if}
      </div>
    {/key}
  </div>
</div>
