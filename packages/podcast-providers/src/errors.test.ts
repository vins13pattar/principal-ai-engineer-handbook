import { describe, expect, it } from "vitest";
import { ModelResponseError } from "./errors.ts";
import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { llmFromModel } from "./ai-sdk.ts";

describe("ModelResponseError", () => {
  it("carries the approved diagnostic fields", () => {
    const error = new ModelResponseError("model returned no object", {
      rawText: "I'd be happy to help!",
      usage: { inputTokens: 100, outputTokens: 20, speechCharacters: 0 },
      finishReason: "stop",
    });

    expect(error.rawText).toBe("I'd be happy to help!");
    expect(error.usage?.inputTokens).toBe(100);
    expect(error.finishReason).toBe("stop");
    expect(error.name).toBe("ModelResponseError");
    expect(error).toBeInstanceOf(Error);
  });

  it("leaves every field undefined when the provider supplied none", () => {
    const error = new ModelResponseError("model returned no object");

    expect(error.rawText).toBeUndefined();
    expect(error.usage).toBeUndefined();
    expect(error.finishReason).toBeUndefined();
  });

  it("exposes nothing beyond the approved fields", () => {
    // The whole point of the translation: a run directory is an artifact
    // people share, and a leaked authorization header in one is a credential
    // disclosure. Anything not on this list must not be reachable.
    //
    // `name` is on the list because assigning `this.name` in a constructor
    // creates an own *enumerable* property -- unlike `message`, which V8
    // defines non-enumerable via `super()`. It is a standard Error field, not
    // a provider internal, and the assertion stays a whitelist: any newly
    // leaked field still fails this.
    const error = new ModelResponseError("m", { rawText: "x" });

    expect(Object.keys(error).sort()).toEqual(["finishReason", "name", "rawText", "usage"]);
  });
});

describe("llmFromModel translation", () => {
  it("translates a schema failure into ModelResponseError", async () => {
    // A model returning prose instead of JSON is the most likely failure on
    // first contact with a real provider, and the raw text is the only thing
    // that makes it diagnosable.
    const model = {
      // Required at runtime for the AI SDK to route the call to `doGenerate`
      // at all -- without it, `generateObject` rejects the model before ever
      // calling `doGenerate`, with `AI_UnsupportedModelVersionError` instead
      // of the `NoObjectGeneratedError` this test means to exercise.
      specificationVersion: "v2",
      provider: "test",
      modelId: "test-model",
      async doGenerate(): Promise<never> {
        throw new NoObjectGeneratedError({
          // The constructor's type requires `response` and `usage`, whose real
          // shapes are nested SDK metadata this test does not exercise --
          // `isInstance` keys off a symbol marker, and the translation only
          // reads text and finishReason. Filling them in would make the test
          // brittle to SDK type changes while asserting nothing more, so this
          // takes the same `as never` escape the fake model above already uses.
          message: "no object generated",
          text: "Sure! Here is a plan:",
          finishReason: "stop",
        } as never);
      },
    };

    const port = llmFromModel("test", model as never);

    let caught: unknown;
    try {
      await port.generate({ schema: z.object({ a: z.string() }), system: "s", prompt: "p" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ModelResponseError);
    const translated = caught as ModelResponseError;
    expect(translated.rawText).toBe("Sure! Here is a plan:");
    expect(translated.finishReason).toBe("stop");
  });

  it("lets unrelated errors through untouched", async () => {
    // Translating everything would hide transport failures behind a schema
    // error, which points debugging at the wrong layer.
    const model = {
      specificationVersion: "v2",
      provider: "test",
      modelId: "test-model",
      async doGenerate(): Promise<never> {
        throw new Error("ECONNREFUSED");
      },
    };

    const port = llmFromModel("test", model as never);

    await expect(
      port.generate({ schema: z.object({ a: z.string() }), system: "s", prompt: "p" }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
