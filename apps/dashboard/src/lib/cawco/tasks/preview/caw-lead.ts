/**
 * tidewater's Caw, as a project page holds him (CawLead, on the page's
 * CawPage): the heads' seat and Ask Caw read him. On a sheet his view is
 * never read and the board is never waited on, so his seat stands as it
 * does once both are in.
 */
import { CawLead } from "../../project/caw-lead.svelte";
import { PROJECT, PROJECT_ROW, TASKS } from "./tidewater";

export const CAW_LEAD = new CawLead({
  id: () => PROJECT,
  project: () => PROJECT_ROW,
  machinesOnline: () => true,
  tasks: () => TASKS,
  reading: () => false,
});
