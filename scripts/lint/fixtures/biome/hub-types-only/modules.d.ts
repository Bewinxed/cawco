// The hub's modules as the fixtures name them: the scripts' project resolves
// no workspace package by name, and Biome reads these files, nothing runs them.
declare module "@cawco/hub" {
  export const createServer: () => string;
  export const startHub: () => Promise<void>;
}
declare module "@cawco/hub/app" {
  export interface HubApp {
    name: string;
  }
}
declare module "@cawco/hub/client" {
  export interface HubClient {
    base: string;
  }
  export const hubClient: (base: string) => HubClient;
  export const hubPath: (route: { "~path": string }) => string;
  export const refusalText: (refusal: unknown) => string;
  export const unwrap: (answer: unknown) => unknown;
}
declare module "@cawco/hub/refusal" {
  export const problem: (detail: string) => Response;
}
