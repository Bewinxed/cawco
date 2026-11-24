<script lang="ts">
  /**
   * The proposed button system on real buttons: every emphasis with every
   * intent, the three sizes with their icon squares, and each emphasis in
   * hover, focus, pressed and disabled. Drawn beside today's Button for the
   * owner to judge; nothing in the app uses it yet.
   */
  import { IconTrash } from "#lib/icons.js";
  import {
    type ProposedButtonLooks,
    proposedButton,
  } from "./proposed-button.js";

  const EMPHASES = ["primary", "secondary", "quiet"] as const;
  const INTENTS = [
    { intent: "none", word: "Start a session" },
    { intent: "danger", word: "Delete the project" },
    { intent: "caution", word: "Allow every command" },
  ] as const;
  const SIZES = ["sm", "md", "lg"] as const;
  const STATES = [
    { state: "hover", label: "Hover" },
    { state: "focus-visible", label: "Focus" },
    { state: "active", label: "Pressed" },
  ] as const;

  /** Puts the stage's forced-state class on the button. */
  const forced = (state: string) => (node: HTMLElement) => {
    node.classList.add(`cawco-${state}`);
    return () => node.classList.remove(`cawco-${state}`);
  };

  /** A proposed button's classes: its words and glyph stand on one mark line. */
  const look = (looks: ProposedButtonLooks) => [
    "mark-line",
    proposedButton(looks),
  ];
</script>

<div class="flex flex-col gap-space-6">
  <section class="flex flex-col gap-space-3" aria-label="Emphasis and intent">
    <p class="text-tx-2 type-meta">Emphasis × intent, medium</p>
    <div class="flex flex-col gap-space-3">
      {#each EMPHASES as emphasis (emphasis)}
        <div class="flex flex-wrap items-center gap-space-2">
          <span class="w-20 text-tx-2 type-meta">{emphasis}</span>
          {#each INTENTS as one (one.intent)}
            <button
              class={["mark-line", look({ emphasis, intent: one.intent })]}
              type="button"
            >
              {#if one.intent === "danger"}<IconTrash />{/if}
              <span>{one.word}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section class="flex flex-col gap-space-3" aria-label="Sizes">
    <p class="text-tx-2 type-meta">Sizes: 32, 36, 44 and their icon squares</p>
    {#each EMPHASES as emphasis (emphasis)}
      <div class="flex flex-wrap items-center gap-space-2">
        {#each SIZES as size (size)}
          <button class={["mark-line", look({ emphasis, size })]} type="button">
            <span>New task</span>
          </button>
          <button
            aria-label="Delete"
            class={["mark-line", look({ emphasis, size, icon: true })]}
            type="button"
          >
            <IconTrash />
          </button>
        {/each}
      </div>
    {/each}
  </section>

  <section class="flex flex-col gap-space-3" aria-label="States">
    <p class="text-tx-2 type-meta">Rest, hover, focus, pressed, disabled</p>
    {#each EMPHASES as emphasis (emphasis)}
      <div class="flex flex-wrap items-center gap-space-2">
        <button class={["mark-line", look({ emphasis })]} type="button"
          ><span>Rest</span></button
        >
        {#each STATES as one (one.state)}
          <button
            class={["mark-line", look({ emphasis })]}
            type="button"
            {@attach forced(one.state)}
          >
            <span>{one.label}</span>
          </button>
        {/each}
        <button
          class={["mark-line", look({ emphasis })]}
          disabled
          type="button"
        >
          <span>Disabled</span>
        </button>
      </div>
    {/each}
  </section>
</div>
