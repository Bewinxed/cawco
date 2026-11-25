// The services' SDKs as the fixtures name them: the scripts' project
// resolves none of them, and Biome reads these files, nothing runs them.
declare module "@octokit/rest" {
  export class Octokit {}
}
declare module "@octokit/webhooks-methods" {
  export const verify: () => unknown;
}
declare module "@linear/sdk" {
  export class LinearClient {}
}
declare module "@linear/sdk/webhooks" {
  export class LinearWebhookClient {}
}
declare module "@gitbeaker/rest" {
  export class Gitlab {}
}
