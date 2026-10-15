import { error } from "@sveltejs/kit";
import { browser, dev } from "$app/env";
import { install, MACHINE, PROJECT, STAGES, TASKS } from "./stand-in";

export const ssr = false;

/** PREVIEW ONLY (uncommitted): Caw's dock on the project page, for the dev server. */
export const load = () => {
  if (!dev) {
    error(404, "Not found");
  }
  if (browser) {
    install();
  }
  return {
    barStrip: true,
    project: PROJECT,
    machine: MACHINE,
    tasks: { ok: true as const, value: TASKS },
    stages: { ok: true as const, value: STAGES },
    view: "board",
    task: null,
  };
};
