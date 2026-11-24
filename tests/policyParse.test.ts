import { describe, expect, it } from "vitest";

import { DEFAULT_POLICY, parsePolicy } from "../src/ai/policy";

describe("parsePolicy", () => {
  it("parses a complete policy", () => {
    const { policy, issues } = parsePolicy(
      JSON.stringify({
        heavyThresholdChars: 1200,
        cloudModel: "gemini-test",
        preferCloudForTasks: ["exam"],
        onDeviceLanguages: ["en"],
        onDeviceEnabled: false,
      }),
    );
    expect(issues).toEqual([]);
    expect(policy.heavyThresholdChars).toBe(1200);
    expect(policy.cloudModel).toBe("gemini-test");
    expect(policy.preferCloudForTasks).toEqual(["exam"]);
    expect(policy.onDeviceLanguages).toEqual(["en"]);
    expect(policy.onDeviceEnabled).toBe(false);
  });

  it("falls back to defaults on malformed JSON", () => {
    const { policy, issues } = parsePolicy("{not json");
    expect(policy).toEqual(DEFAULT_POLICY);
    expect(issues[0]).toMatch(/not valid JSON/i);
  });

  it("falls back to defaults when the value is not an object", () => {
    const { policy, issues } = parsePolicy("[1,2,3]");
    expect(policy).toEqual(DEFAULT_POLICY);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("uses defaults for an empty string", () => {
    const { policy, issues } = parsePolicy("");
    expect(policy).toEqual(DEFAULT_POLICY);
    expect(issues[0]).toMatch(/empty/i);
  });

  it("accepts an already-parsed object", () => {
    const { policy } = parsePolicy({ heavyThresholdChars: 42 });
    expect(policy.heavyThresholdChars).toBe(42);
    expect(policy.cloudModel).toBe(DEFAULT_POLICY.cloudModel);
  });

  it("rejects a non-positive threshold and keeps the default", () => {
    const { policy, issues } = parsePolicy({ heavyThresholdChars: 0 });
    expect(policy.heavyThresholdChars).toBe(DEFAULT_POLICY.heavyThresholdChars);
    expect(issues[0]).toMatch(/positive number/i);
  });

  it("rounds a fractional threshold", () => {
    const { policy } = parsePolicy({ heavyThresholdChars: 800.7 });
    expect(policy.heavyThresholdChars).toBe(801);
  });

  it("drops unknown task kinds but keeps the valid ones", () => {
    const { policy, issues } = parsePolicy({ preferCloudForTasks: ["exam", "nonsense"] });
    expect(policy.preferCloudForTasks).toEqual(["exam"]);
    expect(issues[0]).toMatch(/unknown task kinds/i);
  });

  it("keeps the default task list when the field has the wrong type", () => {
    const { policy, issues } = parsePolicy({ preferCloudForTasks: "exam" });
    expect(policy.preferCloudForTasks).toEqual(DEFAULT_POLICY.preferCloudForTasks);
    expect(issues[0]).toMatch(/must be an array/i);
  });

  it("ignores an empty language list rather than disabling on-device", () => {
    const { policy, issues } = parsePolicy({ onDeviceLanguages: [] });
    expect(policy.onDeviceLanguages).toEqual(DEFAULT_POLICY.onDeviceLanguages);
    expect(issues[0]).toMatch(/empty/i);
  });

  it("ignores a blank cloud model", () => {
    const { policy, issues } = parsePolicy({ cloudModel: "   " });
    expect(policy.cloudModel).toBe(DEFAULT_POLICY.cloudModel);
    expect(issues[0]).toMatch(/cloudModel/i);
  });

  it("treats a non-boolean switch as invalid", () => {
    const { policy, issues } = parsePolicy({ onDeviceEnabled: "false" });
    expect(policy.onDeviceEnabled).toBe(true);
    expect(issues[0]).toMatch(/boolean/i);
  });

  it("does not mutate the shared default policy", () => {
    parsePolicy({ heavyThresholdChars: 5, preferCloudForTasks: ["exam"], onDeviceLanguages: ["en"] });
    expect(DEFAULT_POLICY.heavyThresholdChars).toBe(800);
    expect(DEFAULT_POLICY.preferCloudForTasks).toEqual(["exam", "long-summary"]);
    expect(DEFAULT_POLICY.onDeviceLanguages).toEqual(["en", "ja", "es", "de", "fr"]);
  });
});
