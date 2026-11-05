/**
 * A bench's Caw (dev only): the project's lead as its page makes it
 * (CawLead), on the bench's own records: the project the bench stands, a
 * machine online, nothing being read, no tasks. Called as a bench starts.
 */
import { cawco } from "../client.svelte";
import { CawLead } from "./caw-lead.svelte";

export const benchLead = (projectId: string): CawLead =>
  new CawLead({
    id: () => projectId,
    machinesOnline: () => true,
    project: () => cawco.project(projectId),
    reading: () => false,
    tasks: () => [],
  });
