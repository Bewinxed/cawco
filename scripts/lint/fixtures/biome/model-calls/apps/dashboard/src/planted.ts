// Planted: the dashboard asks a model through OpenRouter by hand.
export const ask = (body: string) =>
  fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    body,
  });
