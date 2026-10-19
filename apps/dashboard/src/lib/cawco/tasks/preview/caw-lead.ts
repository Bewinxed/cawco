/**
 * tidewater's Caw, as a project page holds him (CawLead): the heads' seat
 * and Ask Caw read him. On a sheet his view is never read, so his seat
 * stands as it does while he is read.
 */
import { CawLead } from "../../project/caw-lead.svelte";
import { PROJECT, TASKS } from "./tidewater";

export const CAW_LEAD = new CawLead(
  () => PROJECT,
  () => TASKS,
  () => false
);
