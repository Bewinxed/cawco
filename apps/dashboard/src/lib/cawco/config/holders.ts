/**
 * The machines holding one fleet row (a skill, a plugin, an MCP server):
 * what removing it everywhere reaches, as the question's `items`. The hub
 * keeps which machine has what (each machine's fleet report), not which
 * session uses it, so the machines are the reach it can name.
 */
import { machineLabel } from "@cawco/core";
import type { AskItem } from "../ask-here.svelte";
import type { Machine } from "../client.svelte";

/** What a machine is doing with the row, in a word. */
function holding(machine: Machine, state: string): string {
  if (machine.status !== "online") {
    return "Offline; removed when back";
  }
  return state === "applied" ? "Has it" : "Being sent it";
}

export function holders(
  machines: Machine[],
  kind: "mcp" | "plugins" | "skills",
  key: string
): AskItem[] {
  return machines.flatMap((machine) => {
    const held = machine.fleet?.[kind]?.[key];
    if (!held || held.state === "removed") {
      return [];
    }
    return [
      {
        id: machine.machineId,
        title: machineLabel(machine.hostname),
        lead: { kind: "machine" as const, os: machine.os ?? "" },
        status: holding(machine, held.state),
      },
    ];
  });
}
