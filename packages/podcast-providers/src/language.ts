/**
 * Languages, and which provider can actually speak them.
 *
 * Multilingual is a data-model decision before it is a provider decision, and
 * the expensive mistake is treating language as a string passed to the TTS call
 * at the end. It is not a rendering detail. It reaches back into the pipeline:
 *
 *   - **Translate-then-speak** generates the episode once in English and
 *     translates the script. Cheap, and it sounds translated — English
 *     discourse structure with Hindi words on top.
 *   - **Generate natively** runs the dialogue agents in the target language
 *     against the same source pack. Costs a full generation per language and
 *     needs a reviewer who reads that language, which is the part usually
 *     forgotten.
 *
 * This module does not pick. It makes the choice explicit and records which one
 * an episode used, so a listener complaint about a stilted Hindi episode can be
 * traced to a strategy rather than blamed on the voice.
 */

/** How a non-English episode was produced. Recorded per episode in the manifest. */
export const LOCALISATION_STRATEGIES = ["native", "translated", "source"] as const;
export type LocalisationStrategy = (typeof LOCALISATION_STRATEGIES)[number];

/**
 * Language tags the pipeline understands.
 *
 * Indian languages use the `xx-IN` tags Sarvam's API expects, so no mapping
 * layer is needed for the provider that covers most of them. `en-IN` is a
 * distinct tag from `en-US` on purpose: Indian English is a different voice
 * target, not a fallback.
 */
export const INDIAN_LANGUAGES = [
  "as-IN",
  "bn-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "ks-IN",
  "ml-IN",
  "mr-IN",
  "ne-IN",
  "od-IN",
  "pa-IN",
  "sa-IN",
  "sd-IN",
  "ta-IN",
  "te-IN",
  "ur-IN",
] as const;

export const INTERNATIONAL_LANGUAGES = [
  "en-US",
  "en-GB",
  "es-ES",
  "fr-FR",
  "de-DE",
  "pt-BR",
  "ja-JP",
  "zh-CN",
] as const;

export type LanguageTag =
  (typeof INDIAN_LANGUAGES)[number] | (typeof INTERNATIONAL_LANGUAGES)[number];

export const ALL_LANGUAGES: readonly LanguageTag[] = [
  ...INDIAN_LANGUAGES,
  ...INTERNATIONAL_LANGUAGES,
];

/** The language every episode ships in first. */
export const DEFAULT_LANGUAGE: LanguageTag = "en-US";

export function isIndianLanguage(tag: string): boolean {
  return (INDIAN_LANGUAGES as readonly string[]).includes(tag);
}

/**
 * Which speech provider covers which languages.
 *
 * Sarvam's list is taken from the language tags in its own published SDK
 * (`sarvamai`), not from marketing copy. The international providers are given
 * as the subset this pipeline targets rather than everything they support —
 * claiming a language nobody has listened to is how a broken episode ships.
 */
export const SPEECH_LANGUAGE_COVERAGE: Record<string, readonly LanguageTag[]> = {
  sarvam: INDIAN_LANGUAGES,
  elevenlabs: [...INTERNATIONAL_LANGUAGES, "hi-IN", "ta-IN", "en-IN"],
  openai: INTERNATIONAL_LANGUAGES,
  // Deliberately narrow. Most small local models are English-only, and the
  // honest default is to claim only what has been listened to.
  local: ["en-US", "en-GB"],
};

export function providersFor(language: LanguageTag): string[] {
  return Object.entries(SPEECH_LANGUAGE_COVERAGE)
    .filter(([, languages]) => languages.includes(language))
    .map(([provider]) => provider);
}

/**
 * Refuses a language no configured provider can speak.
 *
 * The failure this prevents is the quiet one: a provider that accepts an
 * unknown language tag, ignores it, and returns confident English audio. That
 * produces a shippable-looking artifact in the wrong language, and nothing in
 * the pipeline downstream can detect it.
 */
export function assertSpeakable(language: LanguageTag, availableProviders: string[]): void {
  const capable = providersFor(language).filter((provider) =>
    availableProviders.includes(provider),
  );
  if (capable.length === 0) {
    const anyone = providersFor(language);
    throw new Error(
      `no configured provider speaks ${language}. ` +
        (anyone.length > 0
          ? `Configure one of: ${anyone.join(", ")}`
          : `No provider in this package covers it.`),
    );
  }
}
