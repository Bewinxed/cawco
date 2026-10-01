import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { FleetSkillPayload } from "@cawco/core";

/** Check before claiming ownership: a failed collision must never enter the sidecar. */
export async function workflowSkillCollision(
  dir: string,
  skill: FleetSkillPayload
): Promise<string | undefined> {
  if (!skill.workflowId) {
    return undefined;
  }
  const path = join(dir, skill.name);
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const file = Bun.file(join(path, "SKILL.md"));
  const owner = Bun.file(join(path, ".cawco-workflow"));
  if (
    !(await file.exists()) &&
    (await owner.exists()) &&
    (await owner.text()) === skill.workflowId
  ) {
    return undefined;
  }
  if (
    (await file.exists()) &&
    (await file.text()).includes(`<!-- cawco-workflow:${skill.workflowId} -->`)
  ) {
    return undefined;
  }
  return `Workflow skill ${skill.name} collides with an operator-installed skill at ${path}.`;
}

export async function guardWorkflowSkillRemoval(
  dir: string,
  name: string
): Promise<void> {
  const owner = Bun.file(join(dir, name, ".cawco-workflow"));
  if (!(await owner.exists())) {
    return;
  }
  const collision = await workflowSkillCollision(dir, {
    name,
    workflowId: await owner.text(),
    hash: "",
  });
  if (collision) {
    throw new Error(collision);
  }
}
