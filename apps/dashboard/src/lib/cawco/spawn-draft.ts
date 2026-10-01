import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";

interface SpawnDraft {
  cwd: string;
  editingPrefill: boolean;
  effort: EffortLevel | null;
  harness: HarnessKind;
  machineId: string;
  model: string;
  permissionMode: PermissionMode;
  prefillKey: string;
  projectId: string | null;
  projectName: string;
  projectQuery: string;
  prompt: string;
  repo: string;
  saveAsProject: boolean;
  sideQuest: boolean;
  source: "directory" | "repo";
  worktree: boolean;
}

/** Browser-memory draft shared by the sidebar and fleet panels; written only by client effects. */
export const spawnDraft: { current: SpawnDraft | null } = { current: null };
