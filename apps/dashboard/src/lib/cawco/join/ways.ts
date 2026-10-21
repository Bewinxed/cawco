/**
 * The ways a machine joins, named the same wherever they are offered: the
 * Connect a machine dialog's tabs, the empty fleet's cards, the Machines
 * popover's rows and pairing panel. Words and glyphs only, no live state, so
 * the tray's states file mounts them without the fleet's client.
 */
import type { Component } from "svelte";
import IconTerminal from "~icons/solar/code-square-bold-duotone";
import IconServer from "~icons/solar/server-2-bold-duotone";

/** The one-liner a machine runs to join: the hub's install script, piped to sh. */
export const installCommand = (hubUrl: string): string =>
  `curl -fsSL ${hubUrl}/install.sh | sh`;

/** The dialog's two ways in: the hub installs over SSH, or one command run on the machine. */
export type JoinWay = "ssh" | "command";

/** One way a machine joins, named the same wherever it is offered. */
export interface JoinWayCard {
  /** Its glyph's section hue. */
  hue: string;
  /** Its glyph (Solar duotone). */
  icon: Component;
  /** One line, short enough for the Machines popover's row. */
  meta: string;
  name: string;
  way: JoinWay;
}

/**
 * The two ways in, in one order and under one name: the Connect a machine
 * dialog's tabs, the empty fleet's cards and the Machines popover's rows.
 */
export const JOIN_WAYS: readonly JoinWayCard[] = [
  {
    way: "ssh",
    icon: IconServer,
    hue: "var(--hue-cyan-500)",
    name: "Over SSH",
    meta: "The hub installs CawCo over SSH",
  },
  {
    way: "command",
    icon: IconTerminal,
    hue: "var(--hue-green-500)",
    name: "With one command",
    meta: "Run one command on the machine",
  },
];
