/**
 * The brand marks the dashboard draws: each company's own logo, from
 * Iconify's logos and thesvg-color sets, by the name the product gives it.
 * No product icon (DESIGN.md's Solar Duotone Rule covers those, through the
 * barrel and this package's index): a mark is the company's, in its colours.
 * `Logo*` is a mark's component; `Svg*` its SVG source (`?raw`), which
 * Accounts masks into a silhouette (accounts/marks.ts). A `?raw` module's
 * type is still the component's (the icons' module types name one), so its
 * reader casts it to the string it is.
 *
 * An entry of its own: the dev server pre-bundles it as one module apart
 * from the icons (the dashboard's vite.config.ts `optimizeDeps.include`),
 * and only what draws a mark loads it. The decision host, which bundles the
 * barrel's icons with Solar alone (core decision-host.ts), never meets it.
 */
export { default as SvgCerebras } from "~icons/logos/cerebras-icon?raw";
export { default as LogoClaude } from "~icons/logos/claude-icon";
export { default as SvgClaude } from "~icons/logos/claude-icon?raw";
export { default as LogoFigma } from "~icons/logos/figma";
export { default as LogoGithub } from "~icons/logos/github-icon";
export { default as LogoGoogleDrive } from "~icons/logos/google-drive";
export { default as LogoGrok } from "~icons/logos/grok-icon";
export { default as SvgHuggingface } from "~icons/logos/hugging-face-icon?raw";
export { default as LogoLinear } from "~icons/logos/linear-icon";
export { default as LogoMistral } from "~icons/logos/mistral-ai-icon";
export { default as LogoMoonshot } from "~icons/logos/moonshot-ai-icon";
export { default as LogoOpenai } from "~icons/logos/openai-icon";
export { default as SvgPerplexity } from "~icons/logos/perplexity-icon?raw";
export { default as LogoQwen } from "~icons/logos/qwen-icon";
export { default as LogoSlack } from "~icons/logos/slack-icon";
export { default as SvgTogether } from "~icons/logos/togetherai-icon?raw";
export { default as SvgBaseten } from "~icons/thesvg-color/baseten?raw";
export { default as SvgBedrock } from "~icons/thesvg-color/bedrock-aws?raw";
export { default as SvgCloudflare } from "~icons/thesvg-color/cloudflare?raw";
export { default as LogoDeepseek } from "~icons/thesvg-color/deepseek";
export { default as SvgDeepseek } from "~icons/thesvg-color/deepseek?raw";
export { default as SvgFireworks } from "~icons/thesvg-color/fireworks?raw";
export { default as SvgCopilot } from "~icons/thesvg-color/github-copilot-light?raw";
export { default as LogoGmail } from "~icons/thesvg-color/gmail";
export { default as LogoGemini } from "~icons/thesvg-color/google-gemini";
export { default as SvgGemini } from "~icons/thesvg-color/google-gemini?raw";
export { default as SvgGrok } from "~icons/thesvg-color/grok-light?raw";
export { default as SvgGroq } from "~icons/thesvg-color/groq?raw";
export { default as SvgKimi } from "~icons/thesvg-color/kimi?raw";
export { default as LogoMeta } from "~icons/thesvg-color/metaai";
export { default as SvgMeta } from "~icons/thesvg-color/metaai?raw";
export { default as LogoMinimax } from "~icons/thesvg-color/minimax";
export { default as SvgMinimax } from "~icons/thesvg-color/minimax?raw";
export { default as SvgMistral } from "~icons/thesvg-color/mistral?raw";
export { default as SvgMoonshot } from "~icons/thesvg-color/moonshot?raw";
export { default as SvgNvidia } from "~icons/thesvg-color/nvidia-light?raw";
export { default as LogoNvidia } from "~icons/thesvg-color/nvidia-nemotron";
export { default as SvgOpenai } from "~icons/thesvg-color/openai-light?raw";
export { default as SvgOpencode } from "~icons/thesvg-color/opencode?raw";
export { default as SvgOpenrouter } from "~icons/thesvg-color/openrouter-light?raw";
export { default as SvgQwen } from "~icons/thesvg-color/qwen-light?raw";
export { default as SvgVercel } from "~icons/thesvg-color/vercel-light?raw";
export { default as SvgXiaomi } from "~icons/thesvg-color/xiaomi?raw";
export { default as LogoZhipu } from "~icons/thesvg-color/zhipu";
export { default as SvgZhipu } from "~icons/thesvg-color/zhipu?raw";
