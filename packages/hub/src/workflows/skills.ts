import type { FleetSkillPayload, Workflow, WorkflowInput } from "@cawco/core";
import { hashFiles } from "../skills";

export function workflowSkill(
  workflow: Pick<Workflow, "id" | "name" | "slug">,
  inputs: WorkflowInput[]
): FleetSkillPayload {
  const name = `wf-${workflow.slug}`;
  const content = `---\nname: ${name}\ndescription: ${JSON.stringify(`Run the ${workflow.name} workflow and receive its reports.`)}\n---\n<!-- cawco-workflow:${workflow.id} -->\n\nCall \`run_workflow('${workflow.slug}', inputs)\` with the inputs below, then wait for its reports. Your session becomes the workflow run's supervisor. Collect required inputs before calling; use the listed defaults when omitted.\n\n${inputs.map((input) => `- Name: ${JSON.stringify(input.name)}; label: ${JSON.stringify(input.label)}; type: ${input.type}; required: ${input.required}; default: ${input.default === undefined ? "none" : JSON.stringify(input.default)}${input.options ? `; options: ${JSON.stringify(input.options)}` : ""}`).join("\n")}\n`;
  const files = [
    {
      path: ".cawco-workflow",
      contentBase64: Buffer.from(workflow.id).toString("base64"),
    },
    {
      path: "SKILL.md",
      contentBase64: Buffer.from(content).toString("base64"),
    },
  ];
  return { name, workflowId: workflow.id, hash: hashFiles(files), files };
}
