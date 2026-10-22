/**
 * The two ways a machine comes in, as the empty fleet and the machines
 * list offer them: each opens Add machine already on its route, so the
 * window starts at Reach.
 */
import type { InstallRoute } from "@cawco/core";
import type { Component } from "svelte";
import { IconKey, IconTerminal } from "#lib/icons.js";

export interface ConnectWay {
  hue: string;
  icon: Component;
  meta: string;
  name: string;
  route: InstallRoute;
}

export const CONNECT_WAYS: readonly ConnectWay[] = [
  {
    route: "ssh",
    name: "Over SSH",
    meta: "The hub signs in and installs",
    icon: IconKey,
    hue: "var(--hue-cyan-400)",
  },
  {
    route: "command",
    name: "By a command",
    meta: "Run one line in a terminal on it",
    icon: IconTerminal,
    hue: "var(--hue-amber-500)",
  },
];
