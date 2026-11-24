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

    await waitFor(() => expect(screen.getByText(/Ohm's law says V = IR\./)).toBeTruthy());

    // the badge reports the SDK's source, not the page's intent
    const badge = document.querySelector(".badge");
    expect(badge?.textContent).toContain("cloud");
    expect(badge?.textContent).toContain("1234 ms");

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
