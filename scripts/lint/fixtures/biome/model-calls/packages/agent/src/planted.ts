// Planted: a vendor's SDK, by import, re-export and on demand.
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
export { default as Anthropic } from "@anthropic-ai/sdk";
export const later = () => import("@openrouter/ai-sdk-provider");

// Left alone: the AI SDK's provider, and the harness Claude Code runs on.
import { createOpenAI } from "@ai-sdk/openai";
import { query } from "@anthropic-ai/claude-agent-sdk";

export const used = [GoogleGenAI, OpenAI, createOpenAI, query];

// Planted: a model's inference path on its vendor's host, sent now or kept
// to send later, and Codex's on a host joined elsewhere.
export const chat = () =>
  fetch("https://api.openai.com/v1/chat/completions", { method: "POST" });
export const MESSAGES = "https://api.anthropic.com/v1/messages";
export const gemini = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
export const codex = (base: string) => `${base}/codex/images/generations`;

// Left alone: account and usage endpoints on the same hosts, a vendor's
// base URL handed to a provider, and a page that names no API.
export const keys = "https://openrouter.ai/api/v1/auth/keys";
export const usage = "https://chatgpt.com/backend-api/wham/usage";
export const base = "https://api.anthropic.com/v1";
export const plans = "https://chatgpt.com/pricing";
export const pictures = "/assets/images/hero.png";
