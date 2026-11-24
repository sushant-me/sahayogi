/**
 * Model construction for the Firebase AI Logic Hybrid Inference SDK.
 *
 * One `GenerativeModel` instance fixes its inference mode, so we cache per
 * (mode, cloud model, system instruction). On-device options and cloud parameters
 * are configured side by side on the same object — that is the whole point of the
 * hybrid SDK, and it is what keeps the two paths from drifting apart.
 */

import { getGenerativeModel, type GenerativeModel } from "firebase/ai";

import { getAiLogic } from "../firebase/ai";
import type { DeviceAvailability, InferenceMode } from "./policy";

/**
 * The SDK's on-device surface is deliberately narrow: expected inputs/outputs,
 * initial prompts, a download monitor and an abort signal. Chrome's own sampling
 * knobs (temperature/topK) are not forwarded, so on-device behaviour is whatever
 * Gemini Nano defaults to. Cloud sampling is configured below instead.
 */
const ON_DEVICE_LANGUAGES = ["en"];

const CLOUD_TEMPERATURE = 0.6;
const CLOUD_MAX_OUTPUT_TOKENS = 2048;

const modelCache = new Map<string, GenerativeModel>();

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export interface BuildModelOptions {
  mode: InferenceMode;
  cloudModel: string;
  systemInstruction: string;
}

export function buildModel(options: BuildModelOptions): GenerativeModel {
  const key = `${options.mode}|${options.cloudModel}|${shortHash(options.systemInstruction)}`;
  const cached = modelCache.get(key);
  if (cached) return cached;

  const model = getGenerativeModel(getAiLogic(), {
    mode: options.mode,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ON_DEVICE_LANGUAGES }],
        expectedOutputs: [{ type: "text", languages: ON_DEVICE_LANGUAGES }],
        initialPrompts: [
          {
            role: "system",
            content: [{ type: "text", value: options.systemInstruction }],
          },
        ],
      },
    },
    inCloudParams: {
      model: options.cloudModel,
      systemInstruction: options.systemInstruction,
      generationConfig: {
        temperature: CLOUD_TEMPERATURE,
        maxOutputTokens: CLOUD_MAX_OUTPUT_TOKENS,
      },
    },
  });

  modelCache.set(key, model);
  return model;
}

interface ChromeLanguageModel {
  availability: () => Promise<string>;
  create: (options?: unknown) => Promise<unknown>;
}

function getChromeLanguageModel(): ChromeLanguageModel | null {
  const candidate = (globalThis as { LanguageModel?: ChromeLanguageModel }).LanguageModel;
  if (!candidate || typeof candidate.availability !== "function") return null;
  return candidate;
}

/**
 * Probes Chrome's Prompt API.
 *
 * Deliberately reads the modern `LanguageModel` global only — the pre-Chrome-138
 * `window.ai.languageModel` shape is gone, and the Firebase SDK itself gates on
 * this same API, so checking it keeps our report and the SDK's behaviour aligned.
 */
export async function getDeviceAvailability(timeoutMs = 4000): Promise<DeviceAvailability> {
  const lm = getChromeLanguageModel();
  if (!lm) return "unsupported";

  try {
    const result = await Promise.race([
      lm.availability(),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
    ]);
    if (result === "available" || result === "downloadable" || result === "downloading") {
      return result;
    }
    if (result === "timeout") return "unavailable";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export interface PreflightResult {
  ok: boolean;
  message: string;
  /** Work is still happening (a download in progress) — not a failure, not finished. */
  pending?: boolean;
}

/**
 * Triggers the on-device model download and warms a session.
 *
 * MUST be called from a real user gesture: Chrome gates a download-triggering
 * session creation on transient activation, and a call without one throws. The
 * UI only ever calls this from the "Enable offline mode" button.
 */
export async function preflightDeviceModel(
  cloudModel: string,
  systemInstruction: string,
  onProgress?: (loaded: number) => void,
): Promise<PreflightResult> {
  const model = buildModel({ mode: "prefer_on_device", cloudModel, systemInstruction });

  const before = await getDeviceAvailability();
  if (before === "available") {
    return { ok: true, message: "On-device model ready." };
  }
  if (before !== "downloadable" && before !== "downloading") {
    return {
      ok: false,
      message: `This browser cannot download the on-device model (reported: ${before}). Cloud answers are unaffected.`,
    };
  }

  let sawProgress = false;
  const storageUsedMb = async (): Promise<number | null> => {
    try {
      if (!navigator.storage?.estimate) return null;
      const estimate = await navigator.storage.estimate();
      return Math.round((estimate.usage ?? 0) / 1048576);
    } catch {
      return null;
    }
  };
  const baselineMb = await storageUsedMb();

  const download = model
    .initializeDeviceModel((progress) => {
      sawProgress = true;
      onProgress?.(progress);
    })
    .then(() => "finished" as const)
    .catch(() => "failed" as const);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * A stalled download looks identical to a slow one, and this promise only settles when the
   * weights are ready — minutes later, legitimately. So watch for the *start*: if Chrome never
   * reports progress and the state never becomes "downloading", the request was accepted and
   * then dropped, which is the Linux case. Leaving the UI at "Preparing…" forever is precisely
   * the failure this app promises not to have.
   */
  const watchdog = (async (): Promise<"started" | "stalled"> => {
    // Evidence of a real download is bytes, not a status string: Chrome on Linux reports
    // availability() === "downloading" indefinitely while nothing arrives. Watch progress
    // callbacks and storage growth for ~60s before calling it stalled.
    for (let tick = 0; tick < 30; tick += 1) {
      await wait(2000);
      if (sawProgress) return "started";
      const now = await getDeviceAvailability();
      if (now === "available") return "started";
      const used = await storageUsedMb();
      if (baselineMb !== null && used !== null && used > baselineMb + 5) return "started";
    }
    return "stalled";
  })();

  const first = await Promise.race([download, watchdog]);

  if (first === "stalled") {
    return {
      ok: false,
      message:
        "Chrome accepted the request but no data arrived. This browser build reports a download without producing one — see docs/browser-support.md. Cloud answers are unaffected.",
    };
  }

  // It really is downloading. Wait for it, but not forever.
  const settled = first === "started" ? await Promise.race([download, wait(10 * 60_000).then(() => "timeout" as const)]) : first;

  if (settled === "timeout") {
    return {
      ok: false,
      pending: true,
      message: "Still downloading after ten minutes. Keep this tab open, then press Re-check.",
    };
  }

  const availability = await getDeviceAvailability();
  if (availability === "available") {
    return { ok: true, message: "On-device model ready." };
  }
  return {
    ok: false,
    pending: availability === "downloading",
    message:
      settled === "failed"
        ? "The download did not complete. Press Enable offline mode to try again."
        : `On-device model did not become available (reported: ${availability}).`,
  };
}
