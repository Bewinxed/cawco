/**
 * Needs you's entries for command-line tools (ToolNeedsRow): one per tool
 * whose copy on some machine waits on the person (core tool-updates.ts
 * `toolsBehind`, `needsYou`: an update that failed, the person's own copy,
 * one the fleet asks about), read off the live machine rows, so an entry
 * leaves by itself once every machine it names runs the version.
 */
import { machineLabel } from "@cawco/core/machine-names";
import { type ToolUpdates, toolSpec } from "@cawco/core/tools";
import { toolUpdateWords as words } from "@cawco/core/words/tool-updates";
import { blockingBehind } from "../blocking";
import type { Machine } from "../stores/board.svelte";
import type { ToolItem, ToolNeedLine } from "./ToolNeedsRow.svelte";

const waitsOnPerson = (
  state: ToolNeedLine["state"] | { kind: string }
): state is ToolNeedLine["state"] =>
  state.kind === "failed" || state.kind === "own" || state.kind === "asked";

export function toolNeedsOf(
  machines: readonly Machine[],
  updates: ToolUpdates,
  releases: Readonly<Record<string, string>>
): ToolItem[] {
  return blockingBehind(machines, updates, releases).flatMap((entry) => {
    const spec = toolSpec(entry.toolId);
    const lines = entry.machines.flatMap((behind): ToolNeedLine[] => {
      const machine = machines.find(
        (each) => each.machineId === behind.machineId
      );
      const { state } = behind;
      return machine && behind.needsYou && waitsOnPerson(state)
        ? [
            {
              machineId: machine.machineId,
              machine: machineLabel(machine.hostname),
              os: machine.os,
              online: behind.online,
              pausedUntil: machine.pausedUntil,
              state,
            },
          ]
        : [];
    });
    const [first] = lines;
    const wants = entry.wants ?? first?.state.wants;
    if (!(spec && wants && first)) {
      return [];
    }
    // Waited since the earliest machine's word on it: a failed update's run.
    const raisedAt = Math.min(
      ...lines.map((line) =>
        line.state.kind === "failed"
          ? line.state.at
          : (machines.find((each) => each.machineId === line.machineId)
              ?.tools?.[spec.id]?.at ?? Date.now())
      )
    );
    const one = lines.length === 1;
    return [
      {
        kind: "tool" as const,
        key: `tool:${spec.id}`,
        spec,
        lines,
        title: one
          ? words.needsTitleOne(spec.name, first.machine)
          : words.needsTitle(spec.name, lines.length),
        want: words.needsWant(spec.name, wants),
        place: words.needsPlace,
        href: "/config/cli-tools",
        raisedAt,
      },
    ];
  });
}
