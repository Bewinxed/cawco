<script lang="ts">
  /**
   * A comment's thread open over the page, as PreviewPane stands it: the
   * card (PinFloat) beside its pill, or the well's foot sheet on a phone,
   * holding the thread (PinCard) with whatever an option puts over its
   * reply (`activity`).
   */
  import type { Pin } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import type { Snippet } from "svelte";
  import { ComposerDraft } from "../../transcript/composer-draft.svelte";
  import PinCard from "../PinCard.svelte";
  import PinFloat from "../PinFloat.svelte";
  import { AGENT } from "./fixture";

  let {
    pin,
    room,
    mark,
    sheet = false,
    activity,
  }: {
    pin: Pin;
    room: { h: number; w: number };
    mark: { h: number; w: number; x: number; y: number } | null;
    /** The well's foot sheet (a phone, a finger). */
    sheet?: boolean;
    activity?: Snippet;
  } = $props();

  const draft = new ComposerDraft();
</script>

<PinFloat
  label={`Comment ${pin.number}`}
  {mark}
  pin={pin.number}
  {room}
  {sheet}
  slot="pin-card"
>
  <PinCard
    {activity}
    agentName={AGENT}
    {draft}
    link={`/artifact/landing-hero#pin-${pin.number}`}
    marked={!!mark}
    name={pinName(pin)}
    onclose={() => undefined}
    ondelete={() => Promise.resolve()}
    onfind={() => undefined}
    onplace={() => undefined}
    onreply={() => undefined}
    onresolve={() => undefined}
    onretry={() => undefined}
    parent="Hero"
    {pin}
    problem={null}
  />
</PinFloat>
