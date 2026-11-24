import { beforeEach, describe, expect, it, vi } from "vitest";

// The orchestration layer is the one place where a pure policy meets a real SDK.
// Mocking only `models.ts` keeps every other decision (language, routing, errors)
// genuinely exercised.
vi.mock("../src/ai/models", () => ({ buildModel: vi.fn() }));

import { runInference, type RunInferenceInput } from "../src/ai/engine";
import { AppError } from "../src/ai/errors";
import { buildModel } from "../src/ai/models";
import { DEFAULT_POLICY } from "../src/ai/policy";

const mockedBuildModel = vi.mocked(buildModel);

function fakeModel(
  chunks: string[],
  source: "on_device" | "in_cloud" | undefined,
  options: { responseText?: string; throwOn?: "stream" | "response" } = {},
) {
  const model = {
    generateContentStream: vi.fn(async () => {
      if (options.throwOn === "stream") throw new Error("App Check token is invalid");
      const stream = (async function* () {
        for (const chunk of chunks) yield { text: () => chunk };
      })();
      const response = options.throwOn === "response"
        ? Promise.reject(new Error("quota exceeded for this project"))
        : Promise.resolve({
            inferenceSource: source,
            text: () => options.responseText ?? chunks.join(""),
          });
      return { stream, response };
    }),
  };
  mockedBuildModel.mockReturnValue(model as never);
  return model;
}

function baseInput(overrides: Partial<RunInferenceInput> = {}): RunInferenceInput {
  return {
    text: "Explain Ohm's law in two sentences.",
    taskKind: "chat",
    userMode: "auto",
    policy: DEFAULT_POLICY,
    availability: "available",
    online: true,
    ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("expected the call to reject");
}

beforeEach(() => {
  mockedBuildModel.mockReset();
});

describe("runInference — routing handoff", () => {
  it("asks the SDK for on-device mode on a light English prompt and reports what it did", async () => {
    fakeModel(["Ohm's law: ", "V = IR."], "on_device");
    const result = await runInference(baseInput());

    expect(mockedBuildModel).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "prefer_on_device", cloudModel: DEFAULT_POLICY.cloudModel }),
    );
    expect(result.text).toBe("Ohm's law: V = IR.");
    expect(result.predicted.inferenceMode).toBe("prefer_on_device");
    expect(result.predicted.reason).toBe("light-task");
    expect(result.actual).toBe("on_device");
    expect(result.detectedScript).toBeNull();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("asks for cloud mode on a heavy task", async () => {
    fakeModel(["## Questions\n1. …"], "in_cloud");
    const result = await runInference(baseInput({ taskKind: "exam", text: "short notes" }));

    expect(mockedBuildModel).toHaveBeenCalledWith(expect.objectContaining({ mode: "prefer_in_cloud" }));
    expect(result.predicted.reason).toBe("heavy-task");
    expect(result.actual).toBe("in_cloud");
  });

  it("sends Devanagari to the cloud and records the script", async () => {
    fakeModel(["किर्कहफको नियम …"], "in_cloud");
    const result = await runInference(baseInput({ text: "किर्कहफको नियम बुझाउनुहोस्।" }));

    expect(result.predicted.inferenceMode).toBe("only_in_cloud");
    expect(result.predicted.reason).toBe("unsupported-language");
    expect(result.detectedScript).toBe("Devanagari");
  });

  it("passes a caller-supplied system instruction through to the model", async () => {
    fakeModel(["ok"], "on_device");
    await runInference(baseInput({ systemInstruction: "Answer in one word." }));
    expect(mockedBuildModel).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: "Answer in one word." }),
    );
  });
});

describe("runInference — refusals before the SDK is called", () => {
  it("refuses offline when nothing can serve the request", async () => {
    const error = await expectAppError(
      runInference(baseInput({ online: false, availability: "unavailable" })),
    );
    expect(error.code).toBe("OFFLINE_NO_DEVICE");
    expect(error.retryable).toBe(true);
    expect(mockedBuildModel).not.toHaveBeenCalled();
  });

  it("tells a user who pinned the cloud something useful when offline", async () => {
    const error = await expectAppError(
      runInference(baseInput({ online: false, userMode: "cloud", availability: "available" })),
    );
    expect(error.code).toBe("NETWORK");
    expect(error.hint).toMatch(/Auto/i);
    expect(mockedBuildModel).not.toHaveBeenCalled();
  });

  it("refuses a script the pinned device cannot read, instead of letting it throw mid-stream", async () => {
    const error = await expectAppError(
      runInference(baseInput({ userMode: "on-device", text: "मेरो प्रश्न" })),
    );
    expect(error.code).toBe("LANGUAGE_UNSUPPORTED_ON_DEVICE");
    expect(error.reason).toBe("forced-device");
    expect(mockedBuildModel).not.toHaveBeenCalled();
  });
});

describe("runInference — streaming and failure mapping", () => {
  it("emits every token in order", async () => {
    fakeModel(["one ", "two ", "three"], "on_device");
    const tokens: string[] = [];
    const result = await runInference(baseInput({ onToken: (t) => tokens.push(t) }));

    expect(tokens).toEqual(["one ", "two ", "three"]);
    expect(result.text).toBe("one two three");
  });

  it("falls back to the response body when the stream yields nothing", async () => {
    fakeModel([], "on_device", { responseText: "from the response body" });
    const result = await runInference(baseInput());
    expect(result.text).toBe("from the response body");
  });

  it("treats an empty answer as a retryable failure rather than showing a blank bubble", async () => {
    fakeModel([], "on_device", { responseText: "" });
    const error = await expectAppError(runInference(baseInput()));
    expect(error.code).toBe("UNKNOWN");
    expect(error.retryable).toBe(true);
  });

  it("maps an App Check rejection to a non-retryable, explained error", async () => {
    fakeModel([], "in_cloud", { throwOn: "stream" });
    const error = await expectAppError(runInference(baseInput({ taskKind: "exam" })));
    expect(error.code).toBe("APP_CHECK_FAILED");
    expect(error.retryable).toBe(false);
    expect(error.reason).toBe("heavy-task");
  });

  it("maps a quota failure and keeps the route reason for the UI", async () => {
    fakeModel(["partial"], "in_cloud", { throwOn: "response" });
    const error = await expectAppError(runInference(baseInput({ taskKind: "long-summary" })));
    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.reason).toBe("heavy-task");
  });

  it("reports a null source when the SDK does not stamp the response", async () => {
    fakeModel(["answer"], undefined);
    const result = await runInference(baseInput());
    expect(result.actual).toBeNull();
  });
});

describe("runInference — device timeout fallback", () => {
  function hangingDeviceModel(chunks: string[], source: "in_cloud") {
    mockedBuildModel.mockImplementation(({ mode }) => {
      if (mode === "prefer_on_device" || mode === "only_on_device") {
        // What Chrome does on this Linux box: the call never settles.
        return { generateContentStream: () => new Promise(() => {}) } as never;
      }
      return {
        generateContentStream: async () => {
          const stream = (async function* () {
            for (const chunk of chunks) yield { text: () => chunk };
          })();
          return { stream, response: Promise.resolve({ inferenceSource: source, text: () => chunks.join("") }) };
        },
      } as never;
    });
  }

  it("falls back to the cloud instead of hanging when the device never answers", async () => {
    hangingDeviceModel(["Cloud answer."], "in_cloud");

    const result = await runInference(baseInput({ deviceTimeoutMs: 25 }));

    // The prediction is preserved, so the badge can show "cloud (fallback)".
    expect(result.predicted.inferenceMode).toBe("prefer_on_device");
    expect(result.actual).toBe("in_cloud");
    expect(result.fallbackReason).toBe("device-timeout");
    expect(result.text).toBe("Cloud answer.");
  });

  it("retries the cloud exactly once", async () => {
    hangingDeviceModel(["ok"], "in_cloud");
    await runInference(baseInput({ deviceTimeoutMs: 25 }));
    expect(mockedBuildModel).toHaveBeenCalledTimes(2);
    expect(mockedBuildModel).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "only_in_cloud" }));
  });

  it("refuses to silently do something else when the user pinned the device", async () => {
    hangingDeviceModel(["should not be used"], "in_cloud");

    const error = await expectAppError(
      runInference(baseInput({ userMode: "on-device", deviceTimeoutMs: 25 })),
    );
    expect(error.code).toBe("DEVICE_NOT_READY");
    expect(error.hint).toMatch(/Auto/i);
    // no cloud retry for an explicit device pin
    expect(mockedBuildModel).toHaveBeenCalledTimes(1);
  });

  it("reports no fallback when the device answers in time", async () => {
    fakeModel(["fast"], "on_device");
    const result = await runInference(baseInput({ deviceTimeoutMs: 5000 }));
    expect(result.fallbackReason).toBeNull();
    expect(result.actual).toBe("on_device");
  });
});

describe("runInference — model fallback chain", () => {
  it("moves to the next model when the primary is retired", async () => {
    // Only models.ts is mocked, so this exercises the real chain logic.
    mockedBuildModel.mockImplementation(({ cloudModel }) =>
      ({
        generateContentStream: async () => {
          if (cloudModel === "retired-model") {
            throw new Error("models/retired-model is not found for API version v1main, or is not supported for generateContent");
          }
          const stream = (async function* () {
            yield { text: () => "answered by the fallback" };
          })();
          return { stream, response: Promise.resolve({ inferenceSource: "in_cloud", text: () => "answered by the fallback" }) };
        },
      }) as never,
    );

    const result = await runInference(
      baseInput({
        taskKind: "exam",
        policy: { ...DEFAULT_POLICY, cloudModel: "retired-model", fallbackCloudModels: ["working-model"] },
      }),
    );

    expect(result.modelUsed).toBe("working-model");
    expect(result.text).toBe("answered by the fallback");
    expect(result.predicted.inferenceMode).toBe("prefer_in_cloud");
  });

  it("tries each model once, in order, and reports the last failure", async () => {
    const tried: string[] = [];
    mockedBuildModel.mockImplementation(({ cloudModel }) => {
      tried.push(cloudModel);
      return {
        generateContentStream: async () => {
          throw new Error("models/x is no longer available to new users");
        },
      } as never;
    });

    const error = await expectAppError(
      runInference(
        baseInput({ taskKind: "exam", policy: { ...DEFAULT_POLICY, cloudModel: "a", fallbackCloudModels: ["b", "c"] } }),
      ),
    );
    expect(error.code).toBe("MODEL_NOT_FOUND");
    expect(tried).toEqual(["a", "b", "c"]);
  });

  it("surfaces the actionable capacity error, not a 404 from the last model tried", async () => {
    // Real shape of a bad day: the primary is rate-limited, the next is retired, and the
    // chain ends on a model id that does not exist. Reporting the 404 would tell the user
    // nothing they can act on.
    mockedBuildModel.mockImplementation(({ cloudModel }) =>
      ({
        generateContentStream: async () => {
          if (cloudModel === "rate-limited") {
            throw new Error("429 You exceeded your current quota, please check your plan and billing details.");
          }
          throw new Error(
            "models/gone is not found for API version v1main, or is not supported for generateContent",
          );
        },
      }) as never,
    );

    const error = await expectAppError(
      runInference(
        baseInput({
          taskKind: "exam",
          policy: {
            ...DEFAULT_POLICY,
            cloudModel: "rate-limited",
            fallbackCloudModels: ["gone", "missing"],
          },
        }),
      ),
    );

    expect(error.code).toBe("QUOTA_EXCEEDED");
    expect(error.message).toMatch(/quota/i);
  });
});
