/**
 * Antigravity's CLI, `agy`: the project config it loads from a folder, ahead
 * of its descriptor. This file becomes its descriptor (core
 * harness/descriptor.ts) once it is a registered harness, and
 * {@link AGY_CLONE_CONFIG} its `cloneConfig`; until then clone-denies.ts
 * stands these in beside the registered harnesses' own, as any agy the
 * owner runs in a clone loads them on the host today.
 */
import type { HarnessDescriptor } from "./descriptor";

/** An empty dir with no write bits, so agy's own writes on the host never fill it. */
const HELD = { kind: "dir", readOnly: true } as const;

/**
 * Every customization dir agy 1.5.5 loads from a project root and runs on
 * the host, each held whole: the dirs hold more loadable names than a list
 * keeps up with (`hooks.json`, which ran a clone's hook on the host;
 * `mcp_config.json` with its stdio servers; `plugins/`, `agents/`,
 * `workflows/`, `skills/`, `rules/` and their manifests). agy also takes
 * `.agent`, `_agents` and `_agent` as `.agents` ("Antigravity also
 * recognizes folders named `.agent/`, `_agents/`, and `_agent/`",
 * customization-discovery doc). `.gemini` too: its `config.json`'s
 * `personal_customization_dir` sends agy to another folder's `.agents`
 * ahead of the project's own (same doc, "Personal folders in a shared
 * repository"). The project's `assets/50e9e4c3/agy-harness-decisions.md`
 * §4.1 and `assets/b3380ec3/agy-harness-parity.md` §P-k.
 */
export const AGY_CLONE_CONFIG = {
  ".agents": HELD,
  ".agent": HELD,
  _agents: HELD,
  _agent: HELD,
  ".gemini": HELD,
} as const satisfies HarnessDescriptor["cloneConfig"];
