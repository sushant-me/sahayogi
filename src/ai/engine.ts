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
  InferenceSource,
  RoutingDecision,
  RoutingPolicy,
  TaskKind,
  UserMode,
} from "./policy";
import { decideRoute } from "./policy";
import { SYSTEM_INSTRUCTION, taskPrompt } from "./prompts";

export interface RunInferenceInput {
  text: string;
  taskKind: TaskKind;
  userMode: UserMode;
  policy: RoutingPolicy;
  availability: DeviceAvailability;
  online: boolean;
  systemInstruction?: string;
  onToken?: (chunk: string) => void;
}

export interface RunInferenceResult {
  text: string;
  predicted: RoutingDecision;
  /** What the SDK reports. `null` only if the SDK did not stamp the response. */
  actual: InferenceSource | null;
  latencyMs: number;
  detectedScript: string | null;
}

function safeResponseText(response: { text: () => string }): string {
  try {
    return response.text();
  } catch {
    return "";
  }
}

export async function runInference(input: RunInferenceInput): Promise<RunInferenceResult> {
  const systemInstruction = input.systemInstruction ?? SYSTEM_INSTRUCTION;
  const detection = detectScript(input.text, input.policy.onDeviceLanguages);

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

  const model = buildModel({
    mode: predicted.inferenceMode,
    cloudModel: input.policy.cloudModel,
    systemInstruction,
  });

  const prompt = taskPrompt(input.taskKind, input.text);
  const startedAt = performance.now();

  try {
    const { stream, response } = await model.generateContentStream(prompt);

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
    const actual = finalResponse.inferenceSource ?? null;
    const text = (accumulated || safeResponseText(finalResponse)).trim();

    if (!text) {
      throw appError("UNKNOWN", "The model returned an empty response.", {
        reason: predicted.reason,
        retryable: true,
      });
    }

    return {
      text,
      predicted,
      actual,
      latencyMs: Math.round(performance.now() - startedAt),
      detectedScript: detection.script,
    };
  } catch (error) {
    const classified = classifyError(error);
    throw appError(classified.code, classified.message, {
      cause: classified.cause,
      reason: predicted.reason,
      retryable: classified.retryable,
    });
  }
}
