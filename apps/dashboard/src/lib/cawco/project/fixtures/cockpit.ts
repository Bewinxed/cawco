/**
 * The cockpit project as the project page's states files stand it: its row
 * as the hub lists it, its one place unread, and its Caw at rest, seated in
 * the head with his panel shut.
 */
import type { ProjectRow } from "../../projects.js";
import { CawLead } from "../caw-lead.svelte.js";

export const COCKPIT: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: "ses-caw-cockpit",
  createdAt: "2026-03-02T10:00:00Z",
  eventsOn: true,
  id: "cockpit",
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/bewinxed/cockpit"],
  name: "cockpit",
  places: [],
  primaryPlaceId: null,
  review: true,
};

/** Its Caw, as the page makes him: at rest, his panel shut. */
export const cockpitLead = (): CawLead =>
  new CawLead({
    id: () => COCKPIT.id,
    machinesOnline: () => true,
    project: () => COCKPIT,
    reading: () => false,
    tasks: () => [],
  });
