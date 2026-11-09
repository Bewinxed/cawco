// Planted: a workspace's columns read outside workspaces.ts.
declare const workspace: {
  host: boolean;
  checksFor: string | null;
  stageFor: string | null;
};
declare const artifacts: { stageFor: (id: string) => string };
declare const request: { host: boolean };
export const a = workspace.host;
export const b = workspace.checksFor;
export const c = workspace.stageFor;
export const d = artifacts.stageFor("x");
export const e = request.host;
