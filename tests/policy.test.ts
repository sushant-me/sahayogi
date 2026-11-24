import { describe, expect, it } from "vitest";

import type { RoutingInput, RoutingPolicy } from "../src/ai/policy";
import { DEFAULT_POLICY, badgeForMode, badgeForPreview, decideRoute } from "../src/ai/policy";

function input(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    text: "Explain Ohm's law briefly.",
    taskKind: "chat",
    userMode: "auto",
    availability: "available",
    online: true,
    policy: DEFAULT_POLICY,
    unsupportedScriptDetected: false,
    ...overrides,
  };
}

const policyWith = (patch: Partial<RoutingPolicy>): RoutingPolicy => ({ ...DEFAULT_POLICY, ...patch });

describe("decideRoute — forced modes", () => {
  it("honours an explicit device request even when the device is unavailable", () => {
    const decision = decideRoute(input({ userMode: "on-device", availability: "unavailable" }));
    expect(decision.inferenceMode).toBe("only_on_device");
    expect(decision.reason).toBe("forced-device");
    expect(decision.explanation).toMatch(/error/i);
  });

  it("honours an explicit cloud request", () => {
    const decision = decideRoute(input({ userMode: "cloud" }));
    expect(decision.inferenceMode).toBe("only_in_cloud");
    expect(decision.reason).toBe("forced-cloud");
  });

  it("lets the user's mode outrank the remote kill switch", () => {
    const decision = decideRoute(
      input({ userMode: "on-device", policy: policyWith({ onDeviceEnabled: false }) }),
    );
    expect(decision.inferenceMode).toBe("only_on_device");
    expect(decision.reason).toBe("forced-device");
  });
});

describe("decideRoute — capability gates", () => {
  it("sends everything to the cloud when the kill switch is off", () => {
    const decision = decideRoute(input({ policy: policyWith({ onDeviceEnabled: false }) }));
    expect(decision.inferenceMode).toBe("only_in_cloud");
    expect(decision.reason).toBe("kill-switch");
  });

  it.each(["unavailable", "unsupported"] as const)("falls back to cloud when the device is %s", (availability) => {
    const decision = decideRoute(input({ availability }));
    expect(decision.inferenceMode).toBe("only_in_cloud");
    expect(decision.reason).toBe("device-unavailable");
  });

  it("routes unsupported scripts to the cloud even when the device is ready", () => {
    const decision = decideRoute(input({ unsupportedScriptDetected: true }));
    expect(decision.inferenceMode).toBe("only_in_cloud");
    expect(decision.reason).toBe("unsupported-language");
  });

  it("keeps light prompts on-device once the model is actually available", () => {
    const decision = decideRoute(input({ availability: "available" }));
    expect(decision.inferenceMode).toBe("prefer_on_device");
    expect(decision.reason).toBe("light-task");
  });

  it.each(["downloadable", "downloading"] as const)(
    "stays in the cloud while the model is only %s",
    (availability) => {
      const decision = decideRoute(input({ availability }));
      expect(decision.inferenceMode).toBe("only_in_cloud");
      expect(decision.reason).toBe("device-not-ready");
      expect(decision.explanation).toMatch(/not downloaded|download/i);
    },
  );

  it("still honours an explicit device pin while the model is not downloaded", () => {
    const decision = decideRoute(input({ userMode: "on-device", availability: "downloadable" }));
    expect(decision.inferenceMode).toBe("only_on_device");
    expect(decision.reason).toBe("forced-device");
  });
});

describe("decideRoute — weight", () => {
  it("prefers the cloud for heavy task kinds when online", () => {
    for (const taskKind of ["exam", "long-summary"] as const) {
      const decision = decideRoute(input({ taskKind, text: "short" }));
      expect(decision.inferenceMode).toBe("prefer_in_cloud");
      expect(decision.reason).toBe("heavy-task");
      expect(decision.degraded).toBe(false);
    }
  });

  it("prefers the cloud for prompts over the threshold", () => {
    const text = "x".repeat(DEFAULT_POLICY.heavyThresholdChars + 1);
    const decision = decideRoute(input({ text }));
    expect(decision.inferenceMode).toBe("prefer_in_cloud");
    expect(decision.reason).toBe("long-prompt");
  });

  it("keeps exactly-at-threshold prompts on the device", () => {
    const text = "x".repeat(DEFAULT_POLICY.heavyThresholdChars);
    const decision = decideRoute(input({ text }));
    expect(decision.inferenceMode).toBe("prefer_on_device");
    expect(decision.reason).toBe("light-task");
  });

  it("runs heavy work on-device in degraded mode when offline", () => {
    const decision = decideRoute(input({ taskKind: "exam", online: false }));
    expect(decision.inferenceMode).toBe("prefer_on_device");
    expect(decision.reason).toBe("offline-degraded");
    expect(decision.degraded).toBe(true);
  });

  it("treats a long prompt offline as degraded rather than failing", () => {
    const text = "y".repeat(DEFAULT_POLICY.heavyThresholdChars + 50);
    const decision = decideRoute(input({ text, online: false }));
    expect(decision.inferenceMode).toBe("prefer_on_device");
    expect(decision.degraded).toBe(true);
  });

  it("respects a threshold supplied by remote config", () => {
    const policy = policyWith({ heavyThresholdChars: 100 });
    const decision = decideRoute(input({ text: "z".repeat(101), policy }));
    expect(decision.reason).toBe("long-prompt");
    expect(decision.diagnostics.heavyThresholdChars).toBe(100);
  });

  it("honours a policy that no longer treats exams as heavy", () => {
    const policy = policyWith({ preferCloudForTasks: [] });
    const decision = decideRoute(input({ taskKind: "exam", text: "short", policy }));
    expect(decision.reason).toBe("light-task");
  });
});

describe("badgeForMode", () => {
  it("reports on-device when prediction and reality agree", () => {
    const badge = badgeForMode("prefer_on_device", "on_device");
    expect(badge.label).toBe("on-device");
    expect(badge.glyph).toBe("device");
    expect(badge.disagreed).toBe(false);
  });

  it("labels a device prediction that landed in the cloud as a fallback", () => {
    const badge = badgeForMode("prefer_on_device", "in_cloud");
    expect(badge.label).toBe("cloud (fallback)");
    expect(badge.glyph).toBe("cloud-fallback");
    expect(badge.disagreed).toBe(true);
  });

  it("does not call a deliberate cloud route a fallback", () => {
    const badge = badgeForMode("only_in_cloud", "in_cloud");
    expect(badge.label).toBe("cloud");
    expect(badge.disagreed).toBe(false);
  });

  it("flags the reverse disagreement", () => {
    const badge = badgeForMode("only_in_cloud", "on_device");
    expect(badge.glyph).toBe("device");
    expect(badge.disagreed).toBe(true);
  });

  it("stays neutral before any inference has completed", () => {
    const badge = badgeForMode("prefer_on_device", null);
    expect(badge.label).toBe("unknown");
  });
});

describe("badgeForPreview", () => {
  it("shows a device prediction as on-device", () => {
    const badge = badgeForPreview("prefer_on_device");
    expect(badge.label).toBe("on-device");
    expect(badge.glyph).toBe("device");
    expect(badge.disagreed).toBe(false);
  });

  it("shows a cloud prediction as cloud", () => {
    expect(badgeForPreview("only_in_cloud").glyph).toBe("cloud");
  });

  it("is honest that a prediction is not evidence", () => {
    expect(badgeForPreview("prefer_on_device").title).toMatch(/Predicted/);
    expect(badgeForPreview("prefer_on_device").title).toMatch(/once the SDK reports/);
  });

  it("handles a missing mode", () => {
    expect(badgeForPreview(null).label).toBe("unknown");
  });
});
