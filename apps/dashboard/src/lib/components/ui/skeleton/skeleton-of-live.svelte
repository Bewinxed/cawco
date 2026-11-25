<script lang="ts" module>
  import type { PieceMachine } from "./skeleton-pieces.svelte";

  /** The machines a fleet's list shows, in the order they joined. */
  const FLEET: PieceMachine[] = [
    {
      name: "obelisk-of-light",
      meta: "Linux · 3 sessions running",
      badge: "Live",
      icon: "cpu",
      live: true,
    },
    {
      name: "studio-mac",
      meta: "macOS · idle since 14:02",
      badge: "Asleep",
      icon: "cpu",
    },
    {
      name: "kestrel",
      meta: "Linux · away since Monday",
      badge: "Away",
      icon: "cpu",
    },
    {
      name: "Anthropic API key",
      meta: "Used by 3 harnesses",
      badge: "Primary",
      icon: "key",
    },
    {
      name: "nixbox",
      meta: "NixOS · 1 session running",
      badge: "Live",
      icon: "cpu",
      live: true,
    },
    {
      name: "Workspace directory",
      meta: "~/code, 14 projects",
      badge: "Shared",
      icon: "folder",
    },
  ];

  /** `count` machines from the fleet, numbered once it runs out. */
  export function fleetOf(count: number): PieceMachine[] {
    return Array.from({ length: count }, (_, k) =>
      FLEET.slice(k % FLEET.length, (k % FLEET.length) + 1).map((machine) =>
        k < FLEET.length
          ? machine
          : {
              ...machine,
              name: `${machine.name}-${Math.floor(k / FLEET.length) + 1}`,
            }
      )
    ).flat();
  }
</script>

<script lang="ts">
  import { setSkeletonShapes } from "./shape.js";
  /**
   * The kit's SkeletonOf as a screen holds it: a piece waiting for its data
   * in the shape this slot last showed, then handing over to the piece as it
   * lands. The last-seen shape stands where the screen's server would hand
   * it (setSkeletonShapes): the list's row count, and the card's lines as
   * captured, since its words are the capture's own length.
   */
  import SkeletonOf from "./skeleton-of.svelte";
  import SkeletonPieces, {
    CAPTURE_FILE,
    CAPTURE_SESSION,
    type PieceName,
  } from "./skeleton-pieces.svelte";

  let {
    piece,
    rows = 3,
    loading = true,
    again = 0,
  }: {
    /** What waits: the list of machines, a session's card, or a file's picture card. */
    piece: PieceName;
    /** How many machines the list held when it was last seen, and holds when it lands. */
    rows?: number;
    /** The data is still coming. */
    loading?: boolean;
    /** Counts presses on Start again: the piece waits from its first frame once more. */
    again?: number;
  } = $props();

  const slot = $derived(`kit:${piece}`);
  setSkeletonShapes(() =>
    piece === "rows" ? { [slot]: { count: rows } } : {}
  );
  const name = $derived(`kit-${piece}`);
</script>

<div class="w-sm max-w-full">
  {#key again}
    <SkeletonOf count={rows} {loading} {name} {slot}>
      <SkeletonPieces
        file={CAPTURE_FILE}
        machines={fleetOf(rows)}
        {piece}
        session={CAPTURE_SESSION}
      />
    </SkeletonOf>
  {/key}
</div>
