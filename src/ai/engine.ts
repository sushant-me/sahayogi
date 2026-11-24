/**
 * Inference orchestration.
 *
 * Flow: detect script → decide route (pure) → build/obtain a hybrid model →
 * stream → read back what the SDK ACTUALLY did (`inferenceSource`) → return
 * both the prediction and the reality.
 *
 * The prediction/reality pair is the product's core data, not a debugging aid.
 */

import { appError, classifyError, offlineError } from "./errors";
import { detectScript } from "./language";
import { buildModel } from "./models";
import type {
  DeviceAvailability,
  InferenceMode,
  InferenceSource,
  RoutingDecision,
  RoutingPolicy,
  TaskKind,
  UserMode,
} from "./policy";
import { decideRoute } from "./policy";
import { tidyModelText } from "./parse";
import { SYSTEM_INSTRUCTION, taskPrompt } from "./prompts";

/**
 * How long we wait for the *initial* call before assuming the device cannot serve
 * it. Chrome reports "downloadable" on machines where the weights will never
 * arrive (observed on Linux), and in that state the SDK waits on the download
 * instead of falling back — which reaches the user as an indefinite hang.
 */
const DEFAULT_DEVICE_CALL_TIMEOUT_MS = 12_000;


const DEVICE_TIMEOUT_CODE = "device-timeout";

export interface RunInferenceInput {
  text: string;
  taskKind: TaskKind;
  userMode: UserMode;
  policy: RoutingPolicy;
  availability: DeviceAvailability;
  online: boolean;
  systemInstruction?: string;
  onToken?: (chunk: string) => void;
  /** Overridable so tests do not have to wait twelve seconds. */
  deviceTimeoutMs?: number;
}

export interface RunInferenceResult {
  text: string;
  predicted: RoutingDecision;
  /** What the SDK reports. `null` only if the SDK did not stamp the response. */
  actual: InferenceSource | null;
  latencyMs: number;
  detectedScript: string | null;
  /** Set when we had to fall back after the device failed to answer in time. */
  fallbackReason: "device-timeout" | null;
  /** Which cloud model answered, when the cloud was used. */
  modelUsed: string | null;
}

interface Attempt {
  text: string;
  actual: InferenceSource | null;
}

function safeResponseText(response: { text: () => string }): string {
  try {
    return response.text();
  } catch {
    return "";
  }
}

function deviceTimeout(): Error {
  return Object.assign(new Error("The on-device model did not respond in time."), {
    code: DEVICE_TIMEOUT_CODE,
  });
}

function isDeviceTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === DEVICE_TIMEOUT_CODE
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(deviceTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runInference(input: RunInferenceInput): Promise<RunInferenceResult> {
  const systemInstruction = input.systemInstruction ?? SYSTEM_INSTRUCTION;
  const detection = detectScript(input.text, input.policy.onDeviceLanguages);
  const timeoutMs = input.deviceTimeoutMs ?? DEFAULT_DEVICE_CALL_TIMEOUT_MS;

  const predicted = decideRoute({
    text: input.text,
    taskKind: input.taskKind,
    userMode: input.userMode,
    availability: input.availability,
    online: input.online,
    policy: input.policy,
    unsupportedScriptDetected: detection.unsupportedForOnDevice,
  });

  // Fail fast and specifically, rather than letting the SDK produce a generic
  // network error the user cannot act on.
  if (!input.online && predicted.inferenceMode === "only_in_cloud") {
    throw offlineError({ pinnedCloud: input.userMode === "cloud" });
  }

  if (predicted.inferenceMode === "only_on_device" && detection.unsupportedForOnDevice) {
    throw appError(
      "LANGUAGE_UNSUPPORTED_ON_DEVICE",
      `The on-device model cannot read ${detection.script ?? "this script"}. Switch Mode to Auto to route it to the cloud.`,
      { reason: predicted.reason },
    );
  }

  const prompt = taskPrompt(input.taskKind, input.text);

  const execute = async (mode: InferenceMode, cloudModel: string): Promise<Attempt> => {
    const model = buildModel({ mode, cloudModel, systemInstruction });

    const devicePath = mode === "prefer_on_device" || mode === "only_on_device";
    const pending = model.generateContentStream(prompt);
    const { stream, response } = devicePath ? await withTimeout(pending, timeoutMs) : await pending;

    let accumulated = "";
    for await (const chunk of stream) {
      let text = "";
      try {
        text = chunk.text();
      } catch {
        // A blocked or empty chunk mid-stream is not fatal: keep what we have.
        text = "";
      }
      if (text) {
        accumulated += text;
        input.onToken?.(text);
      }
    }

    const finalResponse = await response;
    return {
      text: tidyModelText(accumulated || safeResponseText(finalResponse)),
      actual: finalResponse.inferenceSource ?? null,
    };
  };

  /**
   * Cloud models get retired ("no longer available to new users") and saturated
   * ("high demand"). Rather than surfacing either as a dead end, walk the policy's
   * fallback chain, trying each model once — and report which one answered.
   * One attempt per model keeps the worst case to a few seconds instead of a
   * long silence the user would read as a hang.
   */
  const cloudAttempt = async (mode: InferenceMode): Promise<{ attempt: Attempt; model: string }> => {
    const chain = [input.policy.cloudModel, ...input.policy.fallbackCloudModels].filter(
      (model, index, all) => all.indexOf(model) === index,
    );
    let lastError: unknown = null;
    // "Quota exceeded" and "high demand" are things a user can act on (wait, retry,
    // raise the quota). "Model not found" for the last id in the chain is a red herring
    // when earlier attempts were actually capacity-limited, so keep the actionable one.
    let capacityError: unknown = null;

    for (const model of chain) {
      try {
        const attempt = await execute(mode, model);
        return { attempt, model };
      } catch (error) {
        const code = classifyError(error).code;
        // Quota is usually metered per model, so a saturated primary does not mean
        // the whole chain is exhausted — try the next one before giving up.
        if (code === "MODEL_OVERLOADED" || code === "MODEL_NOT_FOUND" || code === "QUOTA_EXCEEDED") {
          if (code !== "MODEL_NOT_FOUND" && capacityError === null) capacityError = error;
          lastError = error;
          continue;
        }
        throw error;
      }
    }

    throw capacityError ?? lastError ?? new Error("No cloud model in the chain could answer.");
  };

  const startedAt = performance.now();

  try {
    let attempt: Attempt;
    let modelUsed: string | null = null;
    let fallbackReason: RunInferenceResult["fallbackReason"] = null;

    try {
      if (predicted.inferenceMode === "only_in_cloud" || predicted.inferenceMode === "prefer_in_cloud") {
        const cloud = await cloudAttempt(predicted.inferenceMode);
        attempt = cloud.attempt;
        modelUsed = cloud.model;
      } else {
        attempt = await execute(predicted.inferenceMode, input.policy.cloudModel);
      }
    } catch (error) {
      if (!isDeviceTimeout(error)) throw error;

      // The user demanded the device: do not quietly do something else.
      if (predicted.inferenceMode === "only_on_device") {
        throw appError(
          "DEVICE_NOT_READY",
          "The on-device model did not respond. It may still be downloading, or Chrome could not start it.",
          {
            reason: predicted.reason,
            hint: "Wait for the download to finish, or switch Mode to Auto to use the cloud.",
          },
        );
      }

      // We *predicted* the device; reality is the cloud. Say so instead of
      // pretending the prediction was right — the badge and ledger will show the
      // disagreement, which is the honest outcome.
      fallbackReason = "device-timeout";
      const cloud = await cloudAttempt("only_in_cloud");
      attempt = cloud.attempt;
      modelUsed = cloud.model;
    }

    if (!attempt.text) {
      throw appError("UNKNOWN", "The model returned an empty response.", {
        reason: predicted.reason,
        retryable: true,
      });
    }

    return {
      text: attempt.text,
      predicted,
      actual: attempt.actual,
      latencyMs: Math.round(performance.now() - startedAt),
      detectedScript: detection.script,
      fallbackReason,
      modelUsed,
    };
  } catch (error) {
    const classified = classifyError(error);
    throw appError(classified.code, classified.message, {
      cause: classified.cause,
      reason: predicted.reason,
      retryable: classified.retryable,
      hint: classified.hint,
    });
  }
}
