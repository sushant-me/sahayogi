/**
 * Language capability detection.
 *
 * Gemini Nano on Chrome accepts only a small set of languages for
 * expectedInputs/expectedOutputs (en, ja, es, de, fr as of this build).
 * Devanagari — and therefore Nepali — is not one of them.
 *
 * Rather than let the device path throw a NotSupportedError mid-conversation,
 * we detect the script up front and route it to the cloud deliberately. This is
 * a product decision made visible in the UI, not a silent workaround.
 */

/** Unicode blocks used by the languages this product targets. */
const DEVANAGARI = /[\u0900-\u097F]/;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F]/;
const HAN = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const HIRAGANA_KATAKANA = /[\u3040-\u30FF]/;
const HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF]/;
const THAI = /[\u0E00-\u0E7F]/;
const CYRILLIC = /[\u0400-\u04FF]/;
const GREEK = /[\u0370-\u03FF]/;

export interface ScriptDetection {
  /** True when the text contains a script the on-device model cannot serve. */
  unsupportedForOnDevice: boolean;
  /** Human-readable script name for the Transparency panel. */
  script: string | null;
  /** Languages the on-device model is known to accept. */
  onDeviceLanguages: string[];
}

/**
 * Romanised Nepali ("mero naam k ho") is Latin script and therefore *is*
 * on-device capable; Devanagari ("मेरो नाम के हो") is not. We deliberately do not
 * try to classify language, only script: guessing is worse than the SDK's own
 * language negotiation.
 */
export function detectScript(
  text: string,
  onDeviceLanguages: string[] = ["en", "ja", "es", "de", "fr"],
): ScriptDetection {
  const sample = text.slice(0, 2000);

  const checks: Array<[RegExp, string, string]> = [
    [DEVANAGARI, "Devanagari", "ne"],
    [ARABIC, "Arabic", "ar"],
    [HANGUL, "Hangul", "ko"],
    [THAI, "Thai", "th"],
    [HIRAGANA_KATAKANA, "Japanese kana", "ja"],
    [HAN, "Han", "zh"],
    [CYRILLIC, "Cyrillic", "ru"],
    [GREEK, "Greek", "el"],
  ];

  for (const [pattern, name, lang] of checks) {
    if (pattern.test(sample)) {
      const supported = onDeviceLanguages.includes(lang);
      return {
        unsupportedForOnDevice: !supported,
        script: name,
        onDeviceLanguages,
      };
    }
  }

  return { unsupportedForOnDevice: false, script: null, onDeviceLanguages };
}
