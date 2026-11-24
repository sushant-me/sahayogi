/**
 * Routing policy — the heart of Sahayogi.
 *
 * This module is deliberately dependency-free: no Firebase, no DOM, no React.
 * Every routing decision is a pure function of its inputs, which is what makes
 * the behaviour testable and diffable in review.
 *
 * The SDK does the actual work of resolving on-device vs cloud. What we own is
 * the *policy*: which inference mode to request for a given prompt, and why.
 */

export type UserMode = "auto" | "on-device" | "cloud";

export type TaskKind = "chat" | "flashcards" | "exam" | "long-summary";

/** Mirrors Chrome's LanguageModel.availability() plus an "unsupported" sentinel. */
export type DeviceAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unsupported";

/** Structurally identical to @firebase/ai's InferenceMode values. */
export type InferenceMode =
  | "prefer_on_device"
  | "only_on_device"
  | "only_in_cloud"
  | "prefer_in_cloud";

/** The SDK's own report of what actually happened. */
export type InferenceSource = "on_device" | "in_cloud";

export type RouteReason =
  | "forced-device"
  | "forced-cloud"
  | "kill-switch"
  | "device-unavailable"
  | "device-not-ready"
  | "unsupported-language"
  | "heavy-task"
  | "long-prompt"
  | "offline-degraded"
  | "light-task";

export interface RoutingPolicy {
  /** Prompt length above which auto mode prefers the cloud. */
  heavyThresholdChars: number;
  /** Task kinds that always prefer the cloud when online. */
  preferCloudForTasks: TaskKind[];
  /** Languages Gemini Nano accepts on-device. Nepal's Devanagari is not among them. */
  onDeviceLanguages: string[];
  /** Cloud model id, resolved at smoke-test time rather than assumed. */
  cloudModel: string;
  /** Tried in order when the primary is overloaded or retired. */
  fallbackCloudModels: string[];
  /** Remote Config kill switch: force everything to the cloud. */
  onDeviceEnabled: boolean;
}

export interface RoutingInput {
  text: string;
  taskKind: TaskKind;
  userMode: UserMode;
  availability: DeviceAvailability;
  online: boolean;
  policy: RoutingPolicy;
  /** Set by the language detector; keeps the decision function pure. */
  unsupportedScriptDetected: boolean;
}

export interface RoutingDecision {
  inferenceMode: InferenceMode;
  reason: RouteReason;
  /** Heavy work running on-device because we are offline: quality is reduced. */
  degraded: boolean;
  /** Human-readable explanation, shown in the Transparency panel. */
  explanation: string;
  diagnostics: {
    chars: number;
    heavyThresholdChars: number;
    availability: DeviceAvailability;
    online: boolean;
    taskKind: TaskKind;
  };
}

export const DEFAULT_POLICY: RoutingPolicy = {
  heavyThresholdChars: 800,
  preferCloudForTasks: ["exam", "long-summary"],
  onDeviceLanguages: ["en", "ja", "es", "de", "fr"],
  cloudModel: "gemini-3.6-flash",
  /**
   * Tried in order after `cloudModel`. `gemini-3.8-pro` was removed: it 404s in this project.
   * `gemini-flash-lite-latest` is last because a lite answer is worth more than no answer when
   * the free tier is rate-limiting the main models: quotas are metered per model, so a lite
   * model can still have allowance when the others do not.
   */
  fallbackCloudModels: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
  onDeviceEnabled: true,
};

const ALL_TASK_KINDS: TaskKind[] = ["chat", "flashcards", "exam", "long-summary"];

export interface PolicyParseResult {
  policy: RoutingPolicy;
  /** Problems found while parsing; surfaced in Settings, never thrown at the user. */
  issues: string[];
}

/**
 * Parses the `routing_policy` Remote Config value defensively.
 * A malformed policy degrades to defaults instead of breaking the app:
 * a bad remote value must never make the product unusable.
 */
export function parsePolicy(raw: unknown): PolicyParseResult {
  const issues: string[] = [];
  const policy: RoutingPolicy = {
    ...DEFAULT_POLICY,
    preferCloudForTasks: [...DEFAULT_POLICY.preferCloudForTasks],
    onDeviceLanguages: [...DEFAULT_POLICY.onDeviceLanguages],
    fallbackCloudModels: [...DEFAULT_POLICY.fallbackCloudModels],
  };

  let value: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    if (raw.trim() === "") {
      return { policy, issues: ["routing_policy is empty; using defaults"] };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      value = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
      if (!value) issues.push("routing_policy is not a JSON object; using defaults");
    } catch {
      issues.push("routing_policy is not valid JSON; using defaults");
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    value = raw as Record<string, unknown>;
  }

  if (!value) return { policy, issues };

  const threshold = value.heavyThresholdChars;
  if (typeof threshold === "number" && Number.isFinite(threshold) && threshold >= 1) {
    policy.heavyThresholdChars = Math.round(threshold);
  } else if (threshold !== undefined) {
    issues.push("heavyThresholdChars must be a positive number; using default");
  }

  if (typeof value.cloudModel === "string" && value.cloudModel.trim() !== "") {
    policy.cloudModel = value.cloudModel.trim();
  } else if (value.cloudModel !== undefined) {
    issues.push("cloudModel must be a non-empty string; using default");
  }

  if (Array.isArray(value.fallbackCloudModels)) {
    policy.fallbackCloudModels = value.fallbackCloudModels.filter(
      (m): m is string => typeof m === "string" && m.trim().length > 0,
    );
  } else if (value.fallbackCloudModels !== undefined) {
    issues.push("fallbackCloudModels must be an array; using default");
  }

  if (Array.isArray(value.preferCloudForTasks)) {
    const valid = value.preferCloudForTasks.filter(
      (t): t is TaskKind => typeof t === "string" && (ALL_TASK_KINDS as string[]).includes(t),
    );
    if (valid.length !== value.preferCloudForTasks.length) {
      issues.push("preferCloudForTasks contained unknown task kinds; they were ignored");
    }
    policy.preferCloudForTasks = valid;
  } else if (value.preferCloudForTasks !== undefined) {
    issues.push("preferCloudForTasks must be an array; using default");
  }

  if (Array.isArray(value.onDeviceLanguages)) {
    const langs = value.onDeviceLanguages.filter(
      (l): l is string => typeof l === "string" && l.length > 0,
    );
    if (langs.length > 0) policy.onDeviceLanguages = langs;
    else issues.push("onDeviceLanguages was empty; using default");
  } else if (value.onDeviceLanguages !== undefined) {
    issues.push("onDeviceLanguages must be an array; using default");
  }

  if (typeof value.onDeviceEnabled === "boolean") {
    policy.onDeviceEnabled = value.onDeviceEnabled;
  } else if (value.onDeviceEnabled !== undefined) {
    issues.push("onDeviceEnabled must be a boolean; using default");
  }

  return { policy, issues };
}

/**
 * The routing table. First match wins; order is the contract.
 *
 * Design notes:
 *  - Rule 6 is intentionally counter-intuitive: heavy work prefers cloud when
 *    online, but offline it runs on-device in a *degraded* mode rather than
 *    failing. A student on a bus still gets an answer.
 *  - `only_on_device` is used only when the user explicitly demands it, because
 *    the SDK throws in that mode when the device cannot serve the request.
 */
export function decideRoute(input: RoutingInput): RoutingDecision {
  const { text, taskKind, userMode, availability, online, policy } = input;
  const chars = text.length;
  const diagnostics: RoutingDecision["diagnostics"] = {
    chars,
    heavyThresholdChars: policy.heavyThresholdChars,
    availability,
    online,
    taskKind,
  };

  const decide = (
    inferenceMode: InferenceMode,
    reason: RouteReason,
    explanation: string,
    degraded = false,
  ): RoutingDecision => ({ inferenceMode, reason, degraded, explanation, diagnostics });

  // 1. Explicit device request — user's choice outranks every heuristic.
  if (userMode === "on-device") {
    return decide(
      "only_on_device",
      "forced-device",
      availability === "available"
        ? "You pinned inference to this device, and the on-device model is ready."
        : "You pinned inference to this device, but the on-device model is not ready. The request will surface an error rather than silently using the cloud.",
    );
  }

  // 2. Explicit cloud request.
  if (userMode === "cloud") {
    return decide("only_in_cloud", "forced-cloud", "You pinned inference to the cloud.");
  }

  // 3. Remote Config kill switch — the operator can disable on-device fleet-wide.
  if (!policy.onDeviceEnabled) {
    return decide(
      "only_in_cloud",
      "kill-switch",
      "On-device inference is disabled by remote config (onDeviceEnabled=false).",
    );
  }

  // 4. No usable local model.
  if (availability === "unavailable" || availability === "unsupported") {
    return decide(
      "only_in_cloud",
      "device-unavailable",
      availability === "unsupported"
        ? "This browser does not expose the Prompt API, so inference runs in the cloud."
        : "Chrome reports the on-device model is unavailable on this machine, so inference runs in the cloud.",
    );
  }

  // 4b. The model exists but is not on disk yet. Asking the SDK for the device in
  // this state makes it wait on a download that may never happen — which presents
  // as an indefinite hang. Until the model is genuinely available we stay in the
  // cloud, and the UI offers the download explicitly instead.
  if (availability !== "available") {
    return decide(
      "only_in_cloud",
      "device-not-ready",
      "The on-device model is not downloaded yet, so this runs in the cloud. Use “Enable offline mode” to download it and keep future prompts on this device.",
    );
  }

  // 5. Language the local model cannot handle (e.g. Devanagari).
  if (input.unsupportedScriptDetected) {
    return decide(
      "only_in_cloud",
      "unsupported-language",
      `This text uses a script outside the on-device model's supported languages (${policy.onDeviceLanguages.join(", ")}), so it is routed to the cloud.`,
    );
  }

  // 6. Heavy work.
  const heavyTask = policy.preferCloudForTasks.includes(taskKind);
  const longPrompt = chars > policy.heavyThresholdChars;

  if (heavyTask || longPrompt) {
    if (online) {
      return decide(
        "prefer_in_cloud",
        heavyTask ? "heavy-task" : "long-prompt",
        heavyTask
          ? `"${taskKind}" tasks need the larger cloud model, so they prefer the cloud and fall back to this device only if the network fails.`
          : `${chars} characters exceeds the ${policy.heavyThresholdChars}-character on-device threshold, so it prefers the cloud.`,
      );
    }
    return decide(
      "prefer_on_device",
      "offline-degraded",
      `You are offline, so this ${taskKind === "chat" ? "long prompt" : taskKind} runs on this device with reduced quality instead of failing.`,
      true,
    );
  }

  // 7. Light work — the default win.
  return decide(
    "prefer_on_device",
    "light-task",
    `${chars} characters is within the ${policy.heavyThresholdChars}-character threshold, so this runs on this device. Cloud is used only if the on-device model is unavailable.`,
  );
}

export interface RouteBadgeModel {
  label: string;
  glyph: "device" | "cloud" | "cloud-fallback";
  /** True when the SDK's actual source differed from our prediction. */
  disagreed: boolean;
  title: string;
}

/**
 * Builds the badge from the SDK's *actual* inference source.
 * When prediction and reality disagree we say so instead of quietly re-labelling:
 * that disagreement is the most interesting data the app produces.
 */
export function badgeFor(
  predicted: RoutingDecision,
  actual: InferenceSource | null,
): RouteBadgeModel {
  return badgeForMode(predicted.inferenceMode, actual);
}

/**
 * Badge for a decision that has not run yet (route preview and streaming).
 *
 * Kept deliberately distinct from `badgeForMode`: a prediction is not an
 * observation, and showing the two with the same styling is how interfaces end up
 * implying evidence they do not have.
 */
export function badgeForPreview(predictedMode: InferenceMode | null): RouteBadgeModel {
  if (predictedMode === null) {
    return {
      label: "unknown",
      glyph: "cloud",
      disagreed: false,
      title: "No routing decision yet.",
    };
  }

  const predictedDevice = predictedMode === "prefer_on_device" || predictedMode === "only_on_device";
  return {
    label: predictedDevice ? "on-device" : "cloud",
    glyph: predictedDevice ? "device" : "cloud",
    disagreed: false,
    title: predictedDevice
      ? "Predicted to run on this device. The badge becomes evidence once the SDK reports the source."
      : "Predicted to run in the cloud. The badge becomes evidence once the SDK reports the source.",
  };
}

/**
 * Badge from a mode rather than a whole decision, so persisted messages (which
 * store the mode, not the full decision object) render identically to live ones.
 */
export function badgeForMode(
  predictedMode: InferenceMode | null,
  actual: InferenceSource | null,
): RouteBadgeModel {
  if (actual === null) {
    return {
      label: "unknown",
      glyph: "cloud",
      disagreed: false,
      title: "No inference has completed yet.",
    };
  }

  if (predictedMode === null) {
    return {
      label: "unknown",
      glyph: "cloud",
      disagreed: false,
      title: "The routing mode for this message was not recorded.",
    };
  }

  const predictedDevice = predictedMode === "prefer_on_device" || predictedMode === "only_on_device";
  const actuallyDevice = actual === "on_device";
  const disagreed = predictedDevice !== actuallyDevice;

  if (actuallyDevice) {
    return {
      label: "on-device",
      glyph: "device",
      disagreed,
      title: disagreed
        ? "We predicted cloud inference, but the SDK ran this on-device."
        : "Ran on this device with Gemini Nano. No request left the machine.",
    };
  }

  if (disagreed && predictedDevice) {
    return {
      label: "cloud (fallback)",
      glyph: "cloud-fallback",
      disagreed,
      title: "We predicted on-device, but the SDK fell back to the cloud. Reason shown in Transparency.",
    };
  }

  return {
    label: "cloud",
    glyph: "cloud",
    disagreed,
    title: "Ran on the cloud-hosted model through Firebase AI Logic.",
  };
}
