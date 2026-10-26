/**
 * A preview story's tray, made as its component starts: on the story's
 * starting network, read once, at the first step the person acts on
 * (Found it: Join), held still by the story's own jump, and disposed with
 * the component. The probe before it is the control's S0a, or Start again
 * and the row's press.
 */
import { onDestroy, untrack } from "svelte";
import { AddressTray, type Network } from "../tray.svelte";
import type { Direction } from "./TrayView.svelte";

/** A direction's story: which tray, and the network it starts on (Tailscale unless named). */
export interface TrayStory {
  direction: Direction;
  network?: Network;
}

export function storyTray(network: () => Network | undefined): AddressTray {
  const tray = new AddressTray({
    network: untrack(network) ?? "tailscale",
  });
  onDestroy(() => tray.dispose());
  tray.jump("found");
  return tray;
}
