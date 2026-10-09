// A fake OpenAI-compatible endpoint: answers every chat completion with a
// short streamed reply naming the credential it was sent, and logs each
// request's Authorization header. No real provider is ever contacted.
const log: string[] = [];

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/log") {
      return Response.json(log);
    }
    if (url.pathname.endsWith("/models")) {
      return Response.json({
        object: "list",
        data: [{ id: "mock-1", object: "model" }],
      });
    }
    const auth = request.headers.get("authorization") ?? "(none)";
    const body = (await request.json().catch(() => ({}))) as {
      stream?: boolean;
    };
    const probe = request.headers.get("x-probe-key");
    log.push(`${url.pathname} ${auth}${probe ? ` probe=${probe}` : ""}`);
    // A key with "limited" in it gets ChatGPT's usage-limit refusal.
    if (auth.includes("limited")) {
      return Response.json(
        {
          error: {
            type: "usage_limit_reached",
            message: "The usage limit has been reached",
            plan_type: "plus",
          },
        },
        { status: 429 }
      );
    }
    const text = `answered with ${auth}`;
    if (!body.stream) {
      return Response.json({
        id: "c1",
        object: "chat.completion",
        created: 0,
        model: "mock-1",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "mock-1", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const sse =
      chunk({ role: "assistant", content: text }, null) +
      chunk({}, "stop") +
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "mock-1", choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n` +
      "data: [DONE]\n\n";
    return new Response(sse, {
      headers: { "content-type": "text/event-stream" },
    });
  },
});
console.log(server.port);
