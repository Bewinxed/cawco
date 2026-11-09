/**
 * A project place's `held` as installable apps' documents declare it, which
 * the places list once showed for the person's Continue and Discard: always
 * null now, its shape kept for the wire only. The wire check (openapi.ts
 * `--check`) refuses to stop sending it while TestFlight 20261017 or
 * 20261018 can be installed, though no app reads it; it goes in the change
 * that expires them (bash apps/apple/scripts/testflight.sh --expire 20261018).
 */
export interface BridgedHeldPlace {
  heldAt: string;
  holds: string;
  instanceId: string;
  size: string;
  title: string;
  workspaceId: string;
}
