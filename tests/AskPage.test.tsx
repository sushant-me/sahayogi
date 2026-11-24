// @vitest-environment jsdom
/**
 * The Ask flow is the product: type, send, get an answer that carries the SDK's own
 * report, record the decision, persist the pair. The engine and persistence are mocked
 * so the test is about the page's orchestration, not about Firebase.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ai/engine", () => ({ runInference: vi.fn() }));
vi.mock("../src/store/persistence", () => ({ getPersistence: vi.fn() }));
vi.mock("../src/state/routingLog", async () => {
  const actual = await vi.importActual<typeof import("../src/state/routingLog")>("../src/state/routingLog");
  return { ...actual, logRoute: vi.fn(), useRoutingLog: () => [] };
});

import { runInference } from "../src/ai/engine";
import { DEFAULT_POLICY } from "../src/ai/policy";
import { AskPage } from "../src/pages/AskPage";
import { AppContext, type AppContextValue } from "../src/state/appContext";
import { logRoute } from "../src/state/routingLog";
import { getPersistence } from "../src/store/persistence";

const mockedRun = vi.mocked(runInference);
const mockedLog = vi.mocked(logRoute);
const mockedPersistence = vi.mocked(getPersistence);

const appendMessage = vi.fn(async () => {});
const createChat = vi.fn(async () => "chat-1");

function stubContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    configured: true,
    diagnostics: { projectId: "demo", appCheck: "enterprise", missing: [] } as unknown as AppContextValue["diagnostics"],
    uid: "uid-1",
    authError: null,
    online: true,
    deviceAvailability: "downloadable",
    deviceChecking: false,
    preflight: { running: false, progress: null, message: null },
    policy: DEFAULT_POLICY,
    policySource: "default",
    policyIssues: [],
    userMode: "auto",
    setUserMode: vi.fn(),
    refreshDevice: vi.fn(async () => {}),
    startPreflight: vi.fn(async () => {}),
    toasts: [],
    pushToast: vi.fn(),
    dismissToast: vi.fn(),
    ...overrides,
  };
}

function renderAsk(overrides: Partial<AppContextValue> = {}) {
  return render(
    <AppContext.Provider value={stubContext(overrides)}>
      <AskPage />
    </AppContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no layout engine, so the component's scroll-into-view call needs a stub
  Element.prototype.scrollIntoView = vi.fn();
  mockedPersistence.mockReturnValue({
    createChat,
    appendMessage,
  } as unknown as ReturnType<typeof getPersistence>);
});

afterEach(() => cleanup());

describe("AskPage", () => {
  it("shows the answer with the source the SDK reported, and records the decision", async () => {
    mockedRun.mockImplementation(async (input) => {
      input.onToken?.("Ohm's law says ");
      input.onToken?.("V = IR.");
      return {
        text: "Ohm's law says V = IR.",
        predicted: {
          inferenceMode: "only_in_cloud",
          reason: "device-not-ready",
          degraded: false,
          explanation: "the on-device model is not downloaded yet",
          diagnostics: { chars: 52, heavyThresholdChars: 800, taskKind: "chat" },
        },
        actual: "in_cloud",
        latencyMs: 1234,
        detectedScript: "latin",
        fallbackReason: null,
        modelUsed: "gemini-3.6-flash",
      } as Awaited<ReturnType<typeof runInference>>;
    });

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "State Ohm's law" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Wait for the badge itself, not just the text: the streaming placeholder also
    // renders the answer text, so waiting on text alone can land during the
    // streaming→final transition (this failed once in CI and not locally).
    await waitFor(() => expect(document.querySelector(".badge")).toBeTruthy());
    const badge = document.querySelector(".badge") as HTMLElement;

    // the badge reports the SDK's source, not the page's intent
    expect(badge.textContent).toContain("cloud");
    expect(badge.textContent).toContain("1234 ms");
    expect(screen.getByText(/Ohm's law says V = IR\./)).toBeTruthy();

    expect(mockedLog).toHaveBeenCalledWith(
      expect.objectContaining({
        taskKind: "chat",
        predictedMode: "only_in_cloud",
        actual: "in_cloud",
        latencyMs: 1234,
        model: "gemini-3.6-flash",
      }),
    );
  });

  it("persists the user turn and the model turn", async () => {
    mockedRun.mockResolvedValue({
      text: "An answer.",
      predicted: {
        inferenceMode: "only_in_cloud",
        reason: "device-not-ready",
        degraded: false,
        explanation: "cloud",
        diagnostics: { chars: 4, heavyThresholdChars: 800, taskKind: "chat" },
      },
      actual: "in_cloud",
      latencyMs: 900,
      detectedScript: "latin",
      fallbackReason: null,
      modelUsed: "gemini-3.6-flash",
    } as Awaited<ReturnType<typeof runInference>>);

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Question text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(appendMessage).toHaveBeenCalledTimes(2));
    expect(createChat).toHaveBeenCalledTimes(1);
    expect(appendMessage.mock.calls[0][1]).toMatchObject({ role: "user", text: "Question text" });
    expect(appendMessage.mock.calls[1][1]).toMatchObject({
      role: "model",
      text: "An answer.",
      actualSource: "in_cloud",
      latencyMs: 900,
    });
  });

  it("offers a retry when inference fails, instead of a dead end", async () => {
    mockedRun.mockRejectedValueOnce(
      Object.assign(new Error("The on-device model did not respond."), {
        code: "DEVICE_NOT_READY",
        hint: "Wait for the download to finish, or switch Mode to Auto.",
      }),
    );

    renderAsk({ userMode: "device" });
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Why fails?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
    expect(screen.getByText(/Wait for the download to finish/)).toBeTruthy();
  });

  it("does not send an empty question", async () => {
    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe("AskPage automatic retry on capacity", () => {
  it("retries by itself when the free tier is rate-limiting, and says so", async () => {
    vi.useFakeTimers();
    const quotaError = Object.assign(new Error("429 You exceeded your current quota"), {
      code: "QUOTA_EXCEEDED",
      hint: "Wait a minute and try again.",
      retryable: true,
    });

    mockedRun.mockRejectedValueOnce(quotaError).mockResolvedValueOnce({
      text: "Answered on the second attempt.",
      predicted: {
        inferenceMode: "only_in_cloud",
        reason: "device-not-ready",
        degraded: false,
        explanation: "cloud",
        diagnostics: { chars: 8, heavyThresholdChars: 800, taskKind: "chat" },
      },
      actual: "in_cloud",
      latencyMs: 500,
      detectedScript: "latin",
      fallbackReason: null,
      modelUsed: "gemini-3.6-flash",
    } as Awaited<ReturnType<typeof runInference>>);

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Will you retry?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // first attempt fails, the banner appears and the question is not lost
    await vi.waitFor(() => expect(screen.getByText(/retrying automatically/i)).toBeTruthy());
    expect(mockedRun).toHaveBeenCalledTimes(1);

    // after the wait it retries by itself, without the user touching anything
    await vi.advanceTimersByTimeAsync(21_000);
    await vi.waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(2));
    vi.useRealTimers();
  });

  it("stops after two retries, so an exhausted quota cannot loop", async () => {
    vi.useFakeTimers();
    const quotaError = Object.assign(new Error("429 You exceeded your current quota"), {
      code: "QUOTA_EXCEEDED",
      hint: "Wait a minute.",
      retryable: true,
    });
    mockedRun.mockRejectedValue(quotaError);

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Loop?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await vi.waitFor(() => expect(screen.getByText(/retrying automatically/i)).toBeTruthy());
    await vi.advanceTimersByTimeAsync(21_000);
    await vi.waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(2));

    // the budget allows one more, 45s out
    await vi.advanceTimersByTimeAsync(46_000);
    await vi.waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(3));

    // then it is terminal for this question: no fourth attempt, and a retry control
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockedRun).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());
    vi.useRealTimers();
  });
});

describe("AskPage motion preference", () => {
  it("scrolls instantly when the user asked for reduced motion", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    mockedRun.mockResolvedValue({
      text: "An answer.",
      predicted: {
        inferenceMode: "only_in_cloud",
        reason: "device-not-ready",
        degraded: false,
        explanation: "cloud",
        diagnostics: { chars: 4, heavyThresholdChars: 800, taskKind: "chat" },
      },
      actual: "in_cloud",
      latencyMs: 100,
      detectedScript: "latin",
      fallbackReason: null,
      modelUsed: "gemini-3.6-flash",
    } as Awaited<ReturnType<typeof runInference>>);

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mockedRun).toHaveBeenCalled());

    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.calls.at(-1)?.[0]).toMatchObject({ behavior: "auto" });
    window.matchMedia = originalMatchMedia;
  });
});

describe("AskPage when history cannot be saved", () => {
  it("keeps the answer on screen and says it was not saved", async () => {
    const pushToast = vi.fn();
    appendMessage.mockRejectedValueOnce(new Error("Missing or insufficient permissions"));
    mockedRun.mockResolvedValue({
      text: "An answer that cannot be stored.",
      predicted: {
        inferenceMode: "only_in_cloud",
        reason: "device-not-ready",
        degraded: false,
        explanation: "cloud",
        diagnostics: { chars: 4, heavyThresholdChars: 800, taskKind: "chat" },
      },
      actual: "in_cloud",
      latencyMs: 800,
      detectedScript: "latin",
      fallbackReason: null,
      modelUsed: "gemini-3.6-flash",
    } as Awaited<ReturnType<typeof runInference>>);

    renderAsk({ pushToast });
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Will this save?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // the answer is never thrown away because storage failed
    await waitFor(() => expect(screen.getByText(/An answer that cannot be stored\./)).toBeTruthy());
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "error", message: expect.stringMatching(/could not be saved to history/i) }),
      ),
    );
  });
});

describe("AskPage automatic retry", () => {
  it("logs one ledger row for a prompt, even when the retry fails too", async () => {
    vi.useFakeTimers();
    mockedLog.mockClear();
    mockedRun.mockRejectedValue({ code: "QUOTA_EXCEEDED", message: "quota exhausted", hint: "wait" });

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Will this be logged twice?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // the retry budget is 20s then 45s; advance past both
    await vi.advanceTimersByTimeAsync(70_000);

    // three attempts were made (original + two retries)...
    expect(mockedRun).toHaveBeenCalledTimes(3);
    // ...but one decision is recorded, because an attempt that is about to be retried
    // is not yet an outcome.
    expect(mockedLog).toHaveBeenCalledTimes(1);
    expect(mockedLog.mock.calls[0][0]).toMatchObject({ actual: null, error: "QUOTA_EXCEEDED" });

    vi.useRealTimers();
  });
});

describe("AskPage when a new chat starts during a retry wait", () => {
  it("drops the armed retry instead of answering into an empty conversation", async () => {
    vi.useFakeTimers();
    mockedLog.mockClear();
    mockedRun.mockReset();
    mockedRun.mockRejectedValue({ code: "QUOTA_EXCEEDED", message: "quota", hint: "wait" });

    renderAsk();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "Question for the old chat" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await vi.waitFor(() => expect(screen.getByText(/retrying automatically/i)).toBeTruthy());
    // the question is genuinely kept on screen while waiting
    expect(screen.getByText("Question for the old chat")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await vi.advanceTimersByTimeAsync(120_000);

    // no retry fired, and the transcript is empty
    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Question for the old chat")).toBeNull();
    vi.useRealTimers();
  });
});
