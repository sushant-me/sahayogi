// @vitest-environment jsdom
/**
 * The on-device half cannot be exercised on this machine (Linux Chrome never downloads
 * the Gemini Nano weights), so the mapping from Chrome's Prompt API to our routing
 * vocabulary is pinned here by mocking the global the SDK itself reads.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDeviceAvailability } from "../src/ai/models";

type GlobalWithLM = typeof globalThis & { LanguageModel?: { availability: () => Promise<string> } };

function installLanguageModel(availability: (() => Promise<string>) | null) {
  const g = globalThis as GlobalWithLM;
  if (availability === null) {
    delete g.LanguageModel;
    return;
  }
  g.LanguageModel = { availability };
}

afterEach(() => {
  installLanguageModel(null);
  vi.restoreAllMocks();
});

describe("getDeviceAvailability", () => {
  it("reports unsupported when Chrome has no Prompt API at all", async () => {
    installLanguageModel(null);
    expect(await getDeviceAvailability()).toBe("unsupported");
  });

  it("reports unsupported when the global exists without availability()", async () => {
    (globalThis as unknown as Record<string, unknown>).LanguageModel = {};
    expect(await getDeviceAvailability()).toBe("unsupported");
  });

  it("passes through available, downloadable and downloading", async () => {
    for (const state of ["available", "downloadable", "downloading"] as const) {
      installLanguageModel(async () => state);
      expect(await getDeviceAvailability()).toBe(state);
    }
  });

  it("treats any unexpected verdict as unavailable rather than guessing", async () => {
    installLanguageModel(async () => "no-such-state");
    expect(await getDeviceAvailability()).toBe("unavailable");
  });

  it("treats a rejected probe as unavailable", async () => {
    installLanguageModel(async () => {
      throw new Error("Prompt API unavailable");
    });
    expect(await getDeviceAvailability()).toBe("unavailable");
  });

  it("does not hang when the probe never settles", async () => {
    installLanguageModel(() => new Promise(() => {}));
    // a 30ms budget stands in for the real 4s guard, so the test stays fast
    expect(await getDeviceAvailability(30)).toBe("unavailable");
  });
});
