/**
 * A local model as an `LlmPort`, through Ollama.
 *
 * The fourth adapter, and the one that makes an episode free. Speech went local
 * first and removed the majority of the bill; this removes the rest. What is
 * left is electricity and about twenty minutes of an M4's attention per
 * episode.
 *
 * The reason this is a small file rather than a project is `LlmPort`: the
 * engine already speaks a narrow interface, so a local model is a swap, not a
 * rewrite. That was the property ADR-0008 was buying, and this is the second
 * time it has paid — `createLocalTts` was the first.
 *
 * Structured output is the part that makes it viable at all. Ollama constrains
 * decoding to a JSON Schema, so the model *cannot* emit a shape the schema
 * rejects — the same guarantee the hosted path gets from `generateObject`,
 * rather than a prompt asking nicely for JSON and a parser hoping. Zod emits
 * the schema, so there is one definition of the shape and no second copy to
 * drift.
 */

import { z } from "zod";
import { ModelResponseError } from "./errors.ts";
import type { LlmPort, LlmResult, StructuredRequest } from "./ports.ts";

export interface OllamaOptions {
  /** e.g. "qwen3:14b". Must already be pulled. */
  modelId: string;
  /** Defaults to Ollama's own. */
  baseUrl?: string;
  /**
   * How long one call may take.
   *
   * Generous by hosted standards because the comparison is wrong: a local
   * model on a laptop is minutes per call where an API is seconds, and a
   * beat that takes four minutes is working, not hung.
   */
  timeoutSeconds?: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function createOllamaLlm(options: OllamaOptions): LlmPort {
  const baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
  const timeoutSeconds = options.timeoutSeconds ?? 900;

  return {
    name: `ollama:${options.modelId}`,

    async generate<T>(request: StructuredRequest<T>): Promise<LlmResult<T>> {
      // Draft 2020-12 keywords Ollama's grammar compiler does not use are
      // harmless, but `$schema` at the root has been known to confuse it, so
      // it goes. Everything that constrains shape stays.
      const { $schema, ...schema } = z.toJSONSchema(request.schema as z.ZodType) as Record<
        string,
        unknown
      >;
      void $schema;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: options.modelId,
            stream: false,
            format: schema,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            options: {
              // The one bound worth carrying over. Left unset, a local model
              // asked for a long segment will happily generate until the
              // context runs out.
              ...(request.maxOutputTokens === undefined
                ? {}
                : { num_predict: request.maxOutputTokens }),
            },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        // A refused connection here means the daemon is not running, which is
        // worth saying plainly: it is the first thing that goes wrong and the
        // error underneath it is an unhelpful `fetch failed`.
        throw new Error(
          `could not reach Ollama at ${baseUrl}: ` +
            `${error instanceof Error ? error.message : String(error)}. ` +
            "Is `ollama serve` running?",
          { cause: error },
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Ollama returned ${response.status} for ${options.modelId}: ${detail.slice(0, 400)}`,
        );
      }

      const body = (await response.json()) as OllamaChatResponse;
      const text = body.message?.content ?? "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Constrained decoding should make this impossible; when it happens the
        // cause is almost always a truncated response, so say which.
        throw new ModelResponseError(
          body.done_reason === "length"
            ? `${options.modelId} hit its output cap and its JSON was cut off mid-structure. ` +
                "Raise llm.maxOutputTokens, or ask for less."
            : `${options.modelId} returned text that is not JSON despite a schema constraint`,
          {
            rawText: text,
            ...(body.done_reason === undefined ? {} : { finishReason: body.done_reason }),
          },
        );
      }

      const validated = request.schema.safeParse(parsed);
      if (!validated.success) {
        throw new ModelResponseError(
          `${options.modelId} returned JSON that does not satisfy the schema: ${validated.error.message}`,
          {
            rawText: text,
            ...(body.done_reason === undefined ? {} : { finishReason: body.done_reason }),
          },
        );
      }

      return {
        value: validated.data,
        modelId: options.modelId,
        usage: {
          // Reported by Ollama, and real: the pipeline's cost arithmetic still
          // works, it just multiplies by a price of zero.
          inputTokens: body.prompt_eval_count ?? 0,
          outputTokens: body.eval_count ?? 0,
          speechCharacters: 0,
        },
      };
    },
  };
}
