/**
 * The machine's one fleet report after a converge of some parts alone
 * (fleet-parts.ts): the hub keeps the report a machine last sent whole
 * (`agents.fleet`), so each converge's report is the last one with the
 * sections of the parts that ran laid over it, every other section as the
 * converge before it left it.
 */
import type {
  FleetReportSection,
  FleetSyncReport,
  PlacedSection,
} from "@cawco/core";
import type { FleetPart } from "./fleet-parts";

/** What each part reports into: the fleet's own rows' sections, its placed copies', and the memory's state. */
const SECTIONS: Record<
  FleetPart,
  {
    memory?: true;
    own: readonly Exclude<FleetReportSection, "memory">[];
    placed: readonly PlacedSection[];
  }
> = {
  mcp: { own: ["mcp"], placed: ["mcp"] },
  plugins: { own: ["marketplaces", "plugins"], placed: [] },
  skills: { own: ["skills"], placed: [] },
  placedSkills: { own: [], placed: ["skills"] },
  memory: { own: [], placed: [], memory: true },
  memoryDocs: { own: ["memoryDocs"], placed: [] },
  placedMemory: { own: [], placed: ["memoryDocs"] },
  hooks: { own: ["hooks"], placed: ["hooks"] },
  harnessConfig: { own: ["harnessConfig"], placed: ["harnessConfig"] },
};

/** A report with nothing in it: the base of a machine's first converge. */
const EMPTY: FleetSyncReport = {
  mcp: {},
  marketplaces: {},
  plugins: {},
  at: 0,
};

/**
 * `last` (none before the machine's first) with each section `parts`
 * reported into taken whole from `fresh`, which a converge of those parts
 * alone came to (core `placedApart` already applied): a row of such a
 * section that `fresh` does not name is gone from it. Every other section,
 * and the probes' `have` and `toolchain`, as `last` has them, unless
 * `fresh` read them.
 */
export const laidOver = (
  last: FleetSyncReport | undefined,
  fresh: FleetSyncReport,
  parts: ReadonlySet<FleetPart>
): FleetSyncReport => {
  const { memory: lastMemory, placed: lastPlaced, ...rest } = last ?? EMPTY;
  const out: FleetSyncReport = { ...rest, at: fresh.at };
  const placed: NonNullable<FleetSyncReport["placed"]> = { ...lastPlaced };
  let memory = lastMemory;
  for (const part of parts) {
    const sections = SECTIONS[part];
    for (const section of sections.own) {
      out[section] = fresh[section] ?? {};
    }
    for (const section of sections.placed) {
      placed[section] = fresh.placed?.[section] ?? {};
    }
    if (sections.memory) {
      ({ memory } = fresh);
    }
  }
  if (parts.has("mcp")) {
    out.mcpByHarness = fresh.mcpByHarness ?? {};
  }
  if (fresh.have) {
    out.have = fresh.have;
  }
  if (fresh.toolchain) {
    out.toolchain = fresh.toolchain;
  }
  const kept = Object.fromEntries(
    Object.entries(placed).filter(
      ([, rows]) => Object.keys(rows as Record<string, unknown>).length > 0
    )
  ) as NonNullable<FleetSyncReport["placed"]>;
  return {
    ...out,
    ...(memory ? { memory } : {}),
    ...(Object.keys(kept).length > 0 ? { placed: kept } : {}),
  };
};
