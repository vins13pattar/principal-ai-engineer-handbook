/**
 * A local model behind an OpenAI-compatible server — LM Studio, vLLM,
 * llama.cpp — as an `LlmPort`.
 *
 * This exists rather than reusing the AI SDK's OpenAI provider because of one
 * failure. Pointed at LM Studio, `generateObject` negotiated a structured-output
 * mode the server did not enforce, and the model answered a request for an
 * episode plan with a Markdown table: correct excerpt ids, sensible beats,
 * eighteen minutes of work, and not JSON. The SDK decides how to ask for
 * structure based on which model it thinks it is talking to, and behind a local
 * endpoint it is talking to something it has never heard of.
 *
 * So the schema goes on the wire explicitly, as `response_format: json_schema`
 * with `strict`, which these servers implement as constrained decoding. The
 * model then cannot emit a shape the schema rejects — the guarantee the whole
 * pipeline is built on, since every stage parses what comes back.
 */

import { z } from "zod";
import { ModelResponseError } from "./errors.ts";
import { patientFetch } from "./http.ts";
import type { LlmPort, LlmResult, StructuredRequest } from "./ports.ts";

export interface OpenAiCompatibleOptions {
  /** The id the server reports, e.g. "qwen/qwen3.5-9b". */
  modelId: string;
  /** Including the version segment, e.g. `http://127.0.0.1:1234/v1`. */
  baseUrl: string;
  /** Sent as a bearer token. Local servers often accept anything. */
  apiKey?: string;
  timeoutSeconds?: number;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenAiCompatibleLlm(options: OpenAiCompatibleOptions): LlmPort {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = patientFetch(options.timeoutSeconds ?? 3600);

  return {
    name: `local:${options.modelId}`,

    async generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
      const schema = z.toJSONSchema(request.schema as z.ZodType) as Record<string, unknown>;
      // `$schema` is metadata, not a constraint, and some grammar compilers
      // choke on it. Everything that describes shape stays.
      delete schema["$schema"];

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: options.modelId,
            stream: false,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "response", strict: true, schema },
            },
            ...(request.maxOutputTokens === undefined
              ? {}
              : { max_tokens: request.maxOutputTokens }),
          }),
        });
      } catch (error) {
        throw new Error(
          `could not reach the model server at ${baseUrl}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `${baseUrl} returned ${response.status} for ${options.modelId}: ${detail.slice(0, 400)}`,
        );
      }

      const body = (await response.json()) as ChatCompletion;
      const choice = body.choices?.[0];
      const text = choice?.message?.content ?? "";
      const finishReason = choice?.finish_reason;

      const usage = {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
        speechCharacters: 0,
      };

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ModelResponseError(
          finishReason === "length"
            ? `${options.modelId} hit its output cap and its JSON was cut off mid-structure. ` +
                "Raise llm.maxOutputTokens, or ask for less."
            : `${options.modelId} returned text that is not JSON. The server may not be ` +
                "enforcing response_format; check that it supports json_schema constrained decoding.",
          { rawText: text, usage, ...(finishReason === undefined ? {} : { finishReason }) },
        );
      }

      const validated = request.schema.safeParse(parsed);
      if (!validated.success) {
        throw new ModelResponseError(
          `${options.modelId} returned JSON that does not satisfy the schema: ${validated.error.message}`,
          { rawText: text, usage, ...(finishReason === undefined ? {} : { finishReason }) },
        );
      }

      return { value: validated.data, modelId: options.modelId, usage };
    },
  };
}
