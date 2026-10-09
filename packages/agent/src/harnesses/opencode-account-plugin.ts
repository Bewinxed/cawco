/**
 * The part of CawCo's OpenCode plugin that runs a session's requests on its
 * CawCo account (see {@link buildHandoffPluginSource} in `opencode.ts`, which
 * puts this source in the plugin file beside the `cawcoAccountsOfSessions`,
 * `cawcoAccountsRoot`, `cawcoGateway` and `cawcoServed` it reads, and the
 * `readFileSync`/`readdirSync` it imports).
 *
 * A request reaches a provider exactly as OpenCode's own sign-in would send
 * it, with the account's credential in its place. Where OpenCode itself has
 * a plugin for the provider, this is that plugin's code ported line for line
 * (OpenCode v1.18.34, packages/opencode/src/…, cited at each piece):
 * ChatGPT's (`plugin/openai/codex.ts`), Copilot's
 * (`plugin/github-copilot/copilot.ts` and `models.ts`) and xAI's sign-in
 * (`plugin/xai.ts`). Every other provider's key goes where its SDK puts the
 * key it is given (`x-api-key` for `@ai-sdk/anthropic`, `x-goog-api-key` for
 * `@ai-sdk/google`, `Authorization` for the rest) or where OpenCode's own code
 * puts the stored key (`AWS_BEARER_TOKEN_BEDROCK`, provider.ts 356-364): the
 * loader hands the SDK {@link OPENCODE_MARKER} as the key, OpenCode's store
 * holds the same value, and the fetch puts the credential wherever it finds
 * that value, in a header or in the query.
 */
import { PROVIDER_LIMIT } from "@cawco/core";
import { OPENCODE_MARKER } from "../provider-accounts";

export const OPENCODE_ACCOUNT_PLUGIN = `const CAWCO_STAMP = "x-cawco-session";
const CAWCO_PLACEHOLDER = ${JSON.stringify(OPENCODE_MARKER)};
const accountOfSession = (sessionID) => {
  try { return JSON.parse(readFileSync(cawcoAccountsOfSessions, "utf8"))[sessionID]; } catch { return undefined; }
};
const heldOf = (account) => {
  try {
    const [entry] = Object.entries(JSON.parse(readFileSync(cawcoAccountsRoot + "/" + account + "/credential.json", "utf8")));
    return entry ? { provider: entry[0], credential: entry[1] } : undefined;
  } catch { return undefined; }
};
// The agent alone refreshes a sign-in: one within two minutes of its expiry
// is asked for again, and read back once the agent has written it.
const freshHeld = async (account) => {
  const held = heldOf(account);
  if (held?.credential.type !== "oauth" || held.credential.expires - Date.now() > 120000) return held;
  const asked = await fetch(cawcoGateway + "/accounts/" + encodeURIComponent(account) + "/fresh", { method: "POST" });
  if (!asked.ok) throw new Error("cawco: the agent did not refresh this account's sign-in: " + (await asked.text()));
  return heldOf(account);
};
const claimsOf = (token) => {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { return undefined; }
};
// OpenCode's own version, the one its plugins name in their User-Agent
// (\`opencode/\${InstallationVersion}\`): its server's /global/health answers
// it (server/routes/instance/httpapi/handlers/global.ts 66-67).
let cawcoVersion;
const opencodeVersion = (input) => {
  cawcoVersion ??= input.client._client.get({ url: "/global/health" }).then((answer) => {
    const version = answer.data?.version;
    if (typeof version !== "string") throw new Error("cawco: OpenCode's /global/health named no version");
    return version;
  });
  cawcoVersion.catch(() => { cawcoVersion = undefined; });
  return cawcoVersion;
};

// ── ChatGPT: plugin/openai/codex.ts 350-435 ──
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"; // codex.ts 12
const chatgptFetch = (url, init, headers, credential) => {
  headers.set("authorization", "Bearer " + credential.access); // 413
  if (credential.accountId) headers.set("ChatGPT-Account-Id", credential.accountId); // 414-416
  const rewrite = url.pathname.includes("/v1/responses") || url.pathname.includes("/chat/completions"); // 422
  const target = rewrite ? new URL(CODEX_API_ENDPOINT) : url; // 423
  if (rewrite) {
    // extractResidency, 80-86
    const claims = claimsOf(credential.access);
    const residency = claims?.["https://api.openai.com/auth"]?.chatgpt_compute_residency ?? claims?.chatgpt_compute_residency;
    if (residency && residency !== "no_constraint") headers.set("x-openai-internal-codex-residency", residency);
  }
  // OpenAIWebSocketPool.withoutInternalHeaders (openai/ws-pool.ts 253-258)
  headers.delete("x-opencode-title");
  return fetch(target, { ...init, body: init?.body, headers });
};

// ── Copilot: plugin/github-copilot/copilot.ts and models.ts ──
const COPILOT_API_VERSION = "2026-06-01"; // copilot.ts 10
const COPILOT_UTILITY_MODELS = ["gpt-5.4-nano", "gpt-4.1", "gpt-4o", "gpt-4o-mini"]; // copilot.ts 11
const SYNTHETIC_ATTACHMENT_PROMPT = "Attached media from tool result:"; // session/message-v2.ts 46
const copilotDomain = (url) => url.replace(/^https?:\\/\\//, "").replace(/\\/$/, ""); // 15-17
const copilotBase = (enterpriseUrl) => enterpriseUrl ? "https://copilot-api." + copilotDomain(enterpriseUrl) : "https://api.githubcopilot.com"; // 26-28
// imgMsg, 31-43: a synthetic user message attaching a tool call's image.
const copilotImgMsg = (msg) => {
  if (msg?.role !== "user") return false;
  const content = msg.content;
  if (typeof content === "string") return content === SYNTHETIC_ATTACHMENT_PROMPT;
  if (!Array.isArray(content)) return false;
  return content.some((part) => (part?.type === "text" || part?.type === "input_text") && part.text === SYNTHETIC_ATTACHMENT_PROMPT);
};
// fix, 45-54
const copilotFix = (model, url) => ({ ...model, api: { ...model.api, url, npm: "@ai-sdk/github-copilot" } });
// isVision / isAgent, 107-158
const copilotKind = (url, init) => {
  try {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    // Completions API
    if (body?.messages && url.includes("completions")) {
      const last = body.messages[body.messages.length - 1];
      return {
        isVision: body.messages.some((msg) => Array.isArray(msg.content) && msg.content.some((part) => part.type === "image_url")),
        isAgent: last?.role !== "user" || copilotImgMsg(last),
      };
    }
    // Responses API
    if (body?.input) {
      const last = body.input[body.input.length - 1];
      return {
        isVision: body.input.some((item) => Array.isArray(item?.content) && item.content.some((part) => part.type === "input_image")),
        isAgent: last?.role !== "user" || copilotImgMsg(last),
      };
    }
    // Messages API
    if (body?.messages) {
      const last = body.messages[body.messages.length - 1];
      const hasNonToolCalls = Array.isArray(last?.content) && last.content.some((part) => part?.type !== "tool_result");
      return {
        isVision: body.messages.some((item) => Array.isArray(item?.content) && item.content.some((part) =>
          part?.type === "image" ||
          // images can be nested inside tool_result content
          (part?.type === "tool_result" && Array.isArray(part?.content) && part.content.some((nested) => nested?.type === "image")))),
        isAgent: !(last?.role === "user" && hasNonToolCalls) || copilotImgMsg(last),
      };
    }
  } catch {}
  return { isVision: false, isAgent: false };
};
// The fetch, 160-178: the GitHub token (\`info.refresh\`) as the bearer.
const copilotFetch = async (url, init, headers, credential, input) => {
  const { isVision, isAgent } = copilotKind(url.href, init);
  if (!headers.has("x-initiator")) headers.set("x-initiator", isAgent ? "agent" : "user");
  headers.set("User-Agent", "opencode/" + (await opencodeVersion(input)));
  headers.set("Authorization", "Bearer " + credential.refresh);
  headers.set("Openai-Intent", "conversation-edits");
  if (isVision) headers.set("Copilot-Vision-Request", "true");
  headers.delete("x-api-key");
  return fetch(url, { ...init, headers });
};
// models.ts 4-57: one /models item, as OpenCode's schema decodes it.
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number";
const isBool = (v) => typeof v === "boolean";
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const opt = (v, test) => v === undefined || test(v);
const strs = (v) => Array.isArray(v) && v.every(isStr);
const copilotItem = (raw) => {
  if (!isObj(raw) || !isObj(raw.capabilities)) return undefined;
  const { capabilities: c } = raw;
  const ok =
    isBool(raw.model_picker_enabled) && isStr(raw.id) && isStr(raw.name) && isStr(raw.version) &&
    opt(raw.supported_endpoints, strs) &&
    opt(raw.policy, (p) => isObj(p) && opt(p.state, isStr)) &&
    opt(raw.billing, (b) => isObj(b) && opt(b.token_prices, (t) => isObj(t) && isNum(t.batch_size) && isObj(t.default) && isNum(t.default.cache_price) && isNum(t.default.input_price) && isNum(t.default.output_price))) &&
    isStr(c.family) &&
    opt(c.limits, (l) => isObj(l) && opt(l.max_context_window_tokens, isNum) && opt(l.max_output_tokens, isNum) && opt(l.max_prompt_tokens, isNum) &&
      opt(l.vision, (v) => isObj(v) && isNum(v.max_prompt_image_size) && isNum(v.max_prompt_images) && strs(v.supported_media_types))) &&
    isObj(c.supports) && opt(c.supports.adaptive_thinking, isBool) && opt(c.supports.max_thinking_budget, isNum) && opt(c.supports.min_thinking_budget, isNum) &&
    opt(c.supports.reasoning_effort, strs) && opt(c.supports.streaming, isBool) && opt(c.supports.structured_outputs, isBool) &&
    opt(c.supports.tool_calls, isBool) && opt(c.supports.vision, isBool);
  return ok ? raw : undefined;
};
// build, models.ts 82-205
const copilotBuild = (key, remote, url, prev) => {
  const reasoning =
    !!remote.capabilities.supports.adaptive_thinking ||
    !!remote.capabilities.supports.reasoning_effort?.length ||
    remote.capabilities.supports.max_thinking_budget !== undefined ||
    remote.capabilities.supports.min_thinking_budget !== undefined;
  const image =
    (remote.capabilities.supports.vision ?? false) ||
    (remote.capabilities.limits.vision?.supported_media_types ?? []).some((item) => item.startsWith("image/"));
  const pdf =
    (remote.capabilities.supports.vision ?? false) &&
    (remote.capabilities.limits.vision?.supported_media_types?.includes("application/pdf") ?? false);
  const isMsgApi = remote.supported_endpoints?.includes("/v1/messages");
  const endpoint = isMsgApi
    ? "messages"
    : remote.supported_endpoints?.includes("/responses")
      ? "responses"
      : remote.supported_endpoints?.includes("/chat/completions")
        ? "chat"
        : undefined;
  const prices = remote.billing?.token_prices;
  // Copilot prices are AIC per billing batch; OpenCode stores USD per million tokens.
  const usdPerMillion = prices && prices.batch_size > 0 ? 10000 / prices.batch_size : 0;
  const model = {
    id: key,
    providerID: "github-copilot",
    api: {
      id: remote.id,
      url: isMsgApi ? url + "/v1" : url,
      npm: isMsgApi ? "@ai-sdk/anthropic" : "@ai-sdk/github-copilot",
      ...(endpoint ? { endpoint } : {}),
    },
    status: "active",
    limit: {
      context: remote.capabilities.limits.max_context_window_tokens ?? remote.capabilities.limits.max_prompt_tokens,
      input: remote.capabilities.limits.max_prompt_tokens,
      output: remote.capabilities.limits.max_output_tokens,
    },
    capabilities: {
      temperature: prev?.capabilities.temperature ?? true,
      reasoning: prev?.capabilities.reasoning ?? reasoning,
      attachment: prev?.capabilities.attachment ?? true,
      toolcall: remote.capabilities.supports.tool_calls,
      input: { text: true, audio: false, image, video: false, pdf },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    family: prev?.family ?? remote.capabilities.family,
    name: prev?.name ?? remote.name,
    cost: {
      input: (prices?.default.input_price ?? 0) * usdPerMillion,
      output: (prices?.default.output_price ?? 0) * usdPerMillion,
      cache: { read: (prices?.default.cache_price ?? 0) * usdPerMillion, write: 0 },
    },
    options: prev?.options ?? {},
    headers: prev?.headers ?? {},
    release_date:
      prev?.release_date ??
      (remote.version.startsWith(remote.id + "-") ? remote.version.slice(remote.id.length + 1) : remote.version),
  };
  const efforts = remote.capabilities.supports.reasoning_effort;
  const variants = {};
  if (!isMsgApi && efforts?.length) {
    for (const effort of efforts) variants[effort] = { reasoningEffort: effort, reasoningSummary: "auto", include: ["reasoning.encrypted_content"] };
  } else if (efforts?.length && remote.capabilities.supports.adaptive_thinking) {
    for (const effort of efforts) variants[effort] = { thinking: { type: "adaptive", display: "summarized" }, effort };
  } else if (remote.capabilities.supports.max_thinking_budget) {
    const max = remote.capabilities.supports.max_thinking_budget;
    variants.max = { thinking: { type: "enabled", budgetTokens: max - 1 } };
    variants.high = { thinking: { type: "enabled", budgetTokens: Math.floor(max / 2) } };
  }
  if (Object.keys(variants).length > 0) model.variants = variants;
  return model;
};
// usable, models.ts 207-214
const copilotUsable = (item) =>
  item.policy?.state !== "disabled" &&
  item.capabilities.limits?.max_output_tokens !== undefined &&
  item.capabilities.limits.max_prompt_tokens !== undefined &&
  item.capabilities.supports.tool_calls !== undefined;
// get, models.ts 216-259
const copilotModelsGet = async (baseURL, headers, existing) => {
  const res = await fetch(baseURL + "/models", { headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("Failed to fetch models: " + res.status);
  const data = await res.json();
  if (!isObj(data) || !Array.isArray(data.data)) throw new Error("Failed to decode models");
  const result = { ...existing };
  const remote = new Map(data.data.flatMap((raw) => {
    const item = copilotItem(raw);
    return item && copilotUsable(item) ? [[item.id, item]] : [];
  }));
  // prune existing models whose api.id isn't in the endpoint response
  for (const [key, model] of Object.entries(result)) {
    const m = remote.get(model.api.id);
    if (!m) { delete result[key]; continue; }
    result[key] = copilotBuild(key, m, baseURL, model);
  }
  // add new endpoint models not already keyed in result
  for (const [id, m] of remote) {
    if (id in result) continue;
    result[id] = copilotBuild(id, m, baseURL);
  }
  return { models: result, pickerEnabled: new Set([...remote].filter(([, item]) => item.model_picker_enabled).map(([id]) => id)) };
};
// Every Copilot account on this machine: the models are listed with each
// one's GitHub token, as OpenCode lists them with its own (copilot.ts 62-92).
const copilotHeld = () => {
  let ids = [];
  try { ids = readdirSync(cawcoAccountsRoot); } catch { return []; }
  return ids.flatMap((account) => {
    const held = heldOf(account);
    return held?.provider === "github-copilot" && held.credential.type === "oauth" ? [held.credential] : [];
  });
};
let copilotModels = {};
const cawcoCopilotPlugin = async (input) => ({
  provider: {
    id: "github-copilot",
    async models(provider) {
      const held = copilotHeld();
      if (held.length === 0) return provider.models;
      const listed = (await Promise.all(held.map(async (credential) => {
        try {
          return await copilotModelsGet(copilotBase(credential.enterpriseUrl), {
            ...provider.options?.headers,
            Authorization: "Bearer " + credential.refresh,
            "User-Agent": "opencode/" + (await opencodeVersion(input)),
            "X-GitHub-Api-Version": COPILOT_API_VERSION,
          }, provider.models);
        } catch { return undefined; }
      }))).filter((one) => one !== undefined);
      if (listed.length === 0) {
        copilotModels = {};
        return Object.fromEntries(Object.entries(provider.models).map(([id, model]) => [id, copilotFix(model, copilotBase(held[0].enterpriseUrl))]));
      }
      // The first account's model wins where two list one id.
      copilotModels = Object.assign({}, ...listed.map((one) => one.models).reverse());
      const picker = new Set(listed.flatMap((one) => [...one.pickerEnabled]));
      return Object.fromEntries(Object.entries(copilotModels).filter(([, model]) => picker.has(model.api.id)));
    },
  },
  // copilot.ts 355-359: the title model from the listed utility models.
  "experimental.provider.small_model": async (incoming, output) => {
    if (incoming.provider.id !== "github-copilot") return;
    output.model = COPILOT_UTILITY_MODELS.map((id) => copilotModels[id]).find((model) => model !== undefined);
  },
});

// A provider's usage-limit refusal (core's PROVIDER_LIMIT): the agent hears
// it at once and ends the session's turn on it, instead of OpenCode retrying
// a refusal no retry gets past.
const CAWCO_LIMIT = ${PROVIDER_LIMIT.toString()};
const noteLimit = async (sessionID, response) => {
  if (response.status < 400 || response.status >= 500) return response;
  const text = await response.clone().text().catch(() => "");
  if (!CAWCO_LIMIT.test(text)) return response;
  await fetch(cawcoGateway + "/opencode/limit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionID, error: text.slice(0, 600) }),
  }).catch(() => undefined);
  return response;
};
const accountFetch = (opencodeProvider, input) => async (request, init) => {
  const headers = new Headers(init?.headers);
  const sessionID = headers.get(CAWCO_STAMP);
  headers.delete(CAWCO_STAMP);
  return noteLimit(sessionID, await sendOnAccount(opencodeProvider, input, request, init, headers, sessionID));
};
const sendOnAccount = async (opencodeProvider, input, request, init, headers, sessionID) => {
  const account = sessionID ? accountOfSession(sessionID) : undefined;
  if (!account) throw new Error("cawco: this OpenCode session runs on no CawCo account for " + opencodeProvider + "; CawCo places it on one when it starts or wakes.");
  const held = await freshHeld(account);
  if (!held) throw new Error("cawco: CawCo account " + account + " holds no sign-in on this machine.");
  const { provider, credential } = held;
  const url = new URL(request instanceof URL ? request.href : typeof request === "string" ? request : request.url);
  if (provider === "openai-codex") return chatgptFetch(url, init, headers, credential);
  // A Copilot key is sent as the SDK's bearer, as OpenCode's own loader
  // leaves a key sign-in to the SDK (copilot.ts 98).
  if (provider === "github-copilot" && credential.type === "oauth") return copilotFetch(url, init, headers, credential, input);
  // The key, or a sign-in's access token, wherever the SDK or OpenCode put the placeholder.
  const secret = credential.type === "api_key" ? credential.key : credential.access;
  for (const [name, value] of [...headers]) {
    if (value.includes(CAWCO_PLACEHOLDER)) headers.set(name, value.replaceAll(CAWCO_PLACEHOLDER, secret));
  }
  if (url.search.includes(CAWCO_PLACEHOLDER)) url.search = url.search.replaceAll(CAWCO_PLACEHOLDER, encodeURIComponent(secret));
  // xAI's sign-in: plugin/xai.ts 290-291.
  if (provider === "xai" && credential.type === "oauth") {
    headers.set("authorization", "Bearer " + secret);
    headers.set("User-Agent", "opencode/" + (await opencodeVersion(input)));
  }
  return fetch(url, { ...init, headers });
};
export const CawcoAccountStamp = async () => ({
  "chat.headers": async (input, output) => {
    if (cawcoServed.has(input.model.providerID)) output.headers[CAWCO_STAMP] = input.sessionID;
  },
});`;
