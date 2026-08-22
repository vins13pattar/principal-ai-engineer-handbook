import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOpenAiCompatibleLlm } from "./openai-compatible.ts";
import { ModelResponseError } from "./errors.ts";

const schema = z.object({ title: z.string().min(1) });

function reply(message: Record<string, unknown>, usage?: Record<string, number>): Response {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message, finish_reason: "stop" }],
      usage: usage ?? { prompt_tokens: 10, completion_tokens: 5 },
    }),
  } as unknown as Response;
}

/** A stand-in for the server, injected rather than stubbed onto the global. */
function serving(handler: (init: RequestInit) => Response): typeof globalThis.fetch {
  return (async (_url: unknown, init: RequestInit) =>
    handler(init)) as unknown as typeof globalThis.fetch;
}

describe("createOpenAiCompatibleLlm", () => {
  // Injected, because the adapter calls undici directly rather than
  // `globalThis.fetch`: the first version of these tests stubbed the global,
  // reached a real model on localhost, and asserted against whatever it said.
  const llm = (fetch: typeof globalThis.fetch) =>
    createOpenAiCompatibleLlm({
      modelId: "test-model",
      baseUrl: "http://localhost:1234/v1",
      fetch,
    });

  const request = { schema, system: "s", prompt: "p" };

  it("sends the schema as a strict json_schema constraint", async () => {
    // The whole reason this adapter exists. Left to the SDK, a local server
    // negotiated a mode it did not enforce and the model answered a plan
    // request with a Markdown table.
    let body: Record<string, unknown> = {};

    await llm(
      serving((init) => {
        body = JSON.parse(String(init.body));
        return reply({ content: JSON.stringify({ title: "ok" }) });
      }),
    ).generate(request);

    const format = body["response_format"] as Record<string, Record<string, unknown>>;
    expect(format["type"]).toBe("json_schema");
    expect(format["json_schema"]!["strict"]).toBe(true);
    // Emitted from the same Zod definition the response is validated against,
    // so there is no second copy of the shape to drift.
    expect(format["json_schema"]!["schema"]).toMatchObject({ type: "object" });
    // Metadata, not a constraint, and some grammar compilers choke on it.
    expect(format["json_schema"]!["schema"]).not.toHaveProperty("$schema");
  });

  it("reads the answer out of reasoning_content when content is empty", async () => {
    // What LM Studio does with a reasoning model: the schema is enforced and
    // the output filed as thinking. Reading only `content` reported a
    // perfectly good response as "not JSON".
    const result = await llm(
      serving(() =>
        reply({ content: "", reasoning_content: JSON.stringify({ title: "from reasoning" }) }),
      ),
    ).generate(request);

    expect(result.value).toEqual({ title: "from reasoning" });
  });

  it("prefers content when the server returns both", async () => {
    const result = await llm(
      serving(() =>
        reply({
          content: JSON.stringify({ title: "the answer" }),
          reasoning_content: "thinking out loud, not JSON",
        }),
      ),
    ).generate(request);

    expect(result.value).toEqual({ title: "the answer" });
  });

  it("reports usage, so a free run still accounts for itself", async () => {
    const result = await llm(
      serving(() =>
        reply(
          { content: JSON.stringify({ title: "ok" }) },
          { prompt_tokens: 22651, completion_tokens: 883 },
        ),
      ),
    ).generate(request);

    expect(result.usage).toEqual({ inputTokens: 22651, outputTokens: 883, speechCharacters: 0 });
  });

  it("says the server may not be enforcing the schema when the text is not JSON", async () => {
    const call = llm(serving(() => reply({ content: "not json at all" }))).generate(request);

    await expect(call).rejects.toThrow(/enforcing response_format/i);
  });

  it("names truncation rather than blaming the schema", async () => {
    const truncated = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title": "cut o' }, finish_reason: "length" }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    } as unknown as Response;

    await expect(llm(serving(() => truncated)).generate(request)).rejects.toThrow(
      /hit its output cap/,
    );
  });

  it("keeps the raw text on a schema failure, so it is diagnosable", async () => {
    const call = llm(
      serving(() => reply({ content: JSON.stringify({ wrong: "shape" }) })),
    ).generate(request);

    await expect(call).rejects.toBeInstanceOf(ModelResponseError);
  });
});
