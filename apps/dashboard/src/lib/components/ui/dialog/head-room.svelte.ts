import { createContext } from "svelte";

/**
 * A kit dialog's floating header, as its body hears of it: the header's
 * height while one stands (Dialog.Header writes it as it is laid out), else
 * null. The body pads its scroller's top by it (`--dialog-room`), stands its
 * grabber over it and draws the head's scroll edge effect under it.
 */
export class HeadRoom {
  height = $state<number | null>(null);
}

export const [headRoom, provideHeadRoom] = createContext<HeadRoom>();
