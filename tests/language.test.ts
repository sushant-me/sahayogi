import { describe, expect, it } from "vitest";

import { DEFAULT_POLICY } from "../src/ai/policy";
import { detectScript } from "../src/ai/language";

const LANGS = DEFAULT_POLICY.onDeviceLanguages;

describe("detectScript", () => {
  it("treats plain English as on-device capable", () => {
    const result = detectScript("Explain Ohm's law in two sentences.", LANGS);
    expect(result.unsupportedForOnDevice).toBe(false);
    expect(result.script).toBeNull();
  });

  it("flags Devanagari as unsupported", () => {
    const result = detectScript("किर्कहफको नियम सरल भाषामा बुझाउनुहोस्।", LANGS);
    expect(result.unsupportedForOnDevice).toBe(true);
    expect(result.script).toBe("Devanagari");
  });

  it("allows Romanised Nepali, because it is Latin script", () => {
    const result = detectScript("mero naam k ho, kirchhoff ko niyam bujhaunus", LANGS);
    expect(result.unsupportedForOnDevice).toBe(false);
  });

  it("flags Arabic", () => {
    expect(detectScript("اشرح قانون أوم", LANGS).unsupportedForOnDevice).toBe(true);
  });

  it("allows Japanese kana because ja is in the supported list", () => {
    const result = detectScript("オームの法則を説明してください", LANGS);
    expect(result.script).toBe("Japanese kana");
    expect(result.unsupportedForOnDevice).toBe(false);
  });

  it("flags Han-only text because zh is not supported on-device", () => {
    expect(detectScript("解释欧姆定律", LANGS).unsupportedForOnDevice).toBe(true);
  });

  it("flags Hangul", () => {
    expect(detectScript("옴의 법칙을 설명해 주세요", LANGS).unsupportedForOnDevice).toBe(true);
  });

  it("detects a single Devanagari character inside English", () => {
    const result = detectScript("Say this in Nepali: नमस्ते", LANGS);
    expect(result.unsupportedForOnDevice).toBe(true);
  });

  it("leaves emoji and punctuation alone", () => {
    const result = detectScript("✅ done — 100% ok?!", LANGS);
    expect(result.unsupportedForOnDevice).toBe(false);
  });

  it("treats empty text as supported (nothing to reject)", () => {
    expect(detectScript("", LANGS).unsupportedForOnDevice).toBe(false);
  });

  it("honours a policy that adds a language", () => {
    const result = detectScript("मेरो प्रश्न", [...LANGS, "ne"]);
    expect(result.unsupportedForOnDevice).toBe(false);
  });

  it("only inspects the first 2000 characters", () => {
    const text = `${"a".repeat(2500)}क`;
    expect(detectScript(text, LANGS).unsupportedForOnDevice).toBe(false);
  });
});
