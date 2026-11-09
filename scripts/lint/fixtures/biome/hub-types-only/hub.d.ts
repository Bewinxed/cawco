// The hub's modules as these fixtures name them, which scripts/ resolves
// by no package name.
declare module "@cawco/hub" {}
declare module "@cawco/hub/app" {
  export type HubApp = { readonly app: true };
}
declare module "@cawco/hub/src/server" {
  export const createServer: () => void;
}
