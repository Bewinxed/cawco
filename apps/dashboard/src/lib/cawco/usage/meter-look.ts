/**
 * How the session card's stat meters draw (StatMeter), while the owner picks
 * one on the decision page: `track`, a rounded track and fill with the pace
 * notch; `cells`, ten cells that fill; `stack`, the label and value over a
 * full-width hairline. A bench sets it (accounts/limit-picker-bench); the
 * card draws `track` everywhere else. Once one is picked the others go.
 */
import { createContext } from "svelte";

export type MeterLook = "track" | "cells" | "stack";

const [lookOf, setLook] = createContext<() => MeterLook>();

/** The look the meters under here draw, read each time it is asked (a dial moves it). */
export const provideMeterLook = (look: () => MeterLook): void => {
  setLook(look);
};

/**
 * The look a meter draws, as a reader taken while the meter mounts (a
 * context is read then only): the bench's, else `track`. Read in a
 * `$derived`, it follows the bench's dial.
 */
export const meterLook = (): (() => MeterLook) => {
  try {
    return lookOf();
  } catch {
    return () => "track";
  }
};
