// The vendor SDKs and AI SDK providers as the fixtures name them: the
// scripts' project resolves none of them, and Biome reads these files,
// nothing runs them.
declare module "@google/genai" {
  export class GoogleGenAI {}
}
declare module "openai" {
  export default class OpenAI {}
}
declare module "@anthropic-ai/sdk" {
  export default class Anthropic {}
}
declare module "@openrouter/ai-sdk-provider" {
  export const createOpenRouter: () => unknown;
}
declare module "@ai-sdk/openai" {
  export const createOpenAI: () => unknown;
}
declare module "@anthropic-ai/claude-agent-sdk" {
  export const query: () => unknown;
}
