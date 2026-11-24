import { describe, expect, it } from "vitest";

import { AppError, appError, classifyError, offlineError } from "../src/ai/errors";

describe("classifyError", () => {
  it("recognises App Check failures by message", () => {
    expect(classifyError(new Error("App Check token is invalid")).code).toBe("APP_CHECK_FAILED");
  });

  it("recognises App Check failures by the compound word", () => {
    expect(classifyError(new Error("appcheck/recaptcha failed")).code).toBe("APP_CHECK_FAILED");
  });

  it("recognises the SDK's only-on-device refusal", () => {
    expect(
      classifyError(new Error("Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.")).code,
    ).toBe("DEVICE_UNAVAILABLE");
  });

  it("recognises a missing local model", () => {
    expect(classifyError(new Error("Local LanguageModel API not available in this environment.")).code).toBe(
      "DEVICE_UNAVAILABLE",
    );
  });

  it("recognises unsupported language errors", () => {
    expect(classifyError(Object.assign(new Error("no"), { name: "NotSupportedError" })).code).toBe(
      "LANGUAGE_UNSUPPORTED_ON_DEVICE",
    );
  });

  it("recognises quota exhaustion", () => {
    expect(classifyError(Object.assign(new Error("x"), { code: "resource-exhausted" })).code).toBe(
      "QUOTA_EXCEEDED",
    );
  });

  it("recognises a bad model id", () => {
    expect(classifyError(new Error("model_not_found: gemini-9")).code).toBe("MODEL_NOT_FOUND");
  });

  it("recognises AI Logic not being enabled for the project", () => {
    const error = classifyError(
      new Error("Firebase AI Logic API has not been used in project 123 before or it is disabled."),
    );
    expect(error.code).toBe("MODEL_NOT_FOUND");
    expect(error.message).toMatch(/not enabled/i);
  });

  it("recognises network failures", () => {
    expect(classifyError(new Error("Failed to fetch")).code).toBe("NETWORK");
  });

  it("recognises cancellation", () => {
    expect(classifyError(Object.assign(new Error("x"), { name: "AbortError" })).code).toBe("CANCELLED");
  });

  it("falls back to UNKNOWN and stays retryable", () => {
    const error = classifyError(new Error("something odd"));
    expect(error.code).toBe("UNKNOWN");
    expect(error.retryable).toBe(true);
  });

  it("passes an AppError through untouched", () => {
    const original = appError("QUOTA_EXCEEDED", "slow down");
    expect(classifyError(original)).toBe(original);
  });

  it("survives a non-Error rejection", () => {
    expect(classifyError("just a string").code).toBe("UNKNOWN");
    expect(classifyError(undefined).code).toBe("UNKNOWN");
  });
});

describe("offlineError", () => {
  it("explains the pinned-cloud case instead of blaming the device", () => {
    const error = offlineError({ pinnedCloud: true });
    expect(error.code).toBe("NETWORK");
    expect(error.message).toMatch(/pinned inference to the cloud/i);
    expect(error.hint).toMatch(/Mode to Auto/i);
    expect(error.reason).toBe("forced-cloud");
  });

  it("explains the no-device case", () => {
    const error = offlineError({ pinnedCloud: false });
    expect(error.code).toBe("OFFLINE_NO_DEVICE");
    expect(error.reason).toBe("device-unavailable");
    expect(error.retryable).toBe(true);
  });
});

describe("AppError", () => {
  it("carries a code, hint and retry policy", () => {
    const error = new AppError({ code: "QUOTA_EXCEEDED", message: "m", hint: "h", retryable: true });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AppError");
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.hint).toBe("h");
  });

  it("supplies a default hint per code", () => {
    expect(appError("APP_CHECK_FAILED", "m").hint).toMatch(/site key|domain/i);
    expect(appError("DEVICE_NOT_READY", "m").hint).toMatch(/download/i);
  });
});

describe("classifyError — service-level refusals", () => {
  it("does not mistake a 403 for a network failure", () => {
    const sdkError = new Error(
      "AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:streamGenerateContent: [403 ] Permission denied on the service.",
    );
    const classified = classifyError(sdkError);
    expect(classified.code).toBe("PERMISSION_DENIED");
    expect(classified.retryable).toBe(false);
    expect(classified.hint).toMatch(/AI Logic/i);
  });

  it("recognises the ACCESS_DENIED reason token", () => {
    expect(classifyError(new Error('{"reason":"ACCESS_DENIED"}')).code).toBe("PERMISSION_DENIED");
  });

  it("still classifies a plain fetch failure as a network problem", () => {
    expect(classifyError(new Error("Failed to fetch")).code).toBe("NETWORK");
  });
});
