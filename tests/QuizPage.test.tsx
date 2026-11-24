// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunInferenceResult } from "../src/ai/engine";

// Only the two boundaries are mocked: the app state (so no Firebase is needed) and
// the engine (so no model call happens). Everything between them is real UI code.
vi.mock("../src/state/appContext", () => ({
  useApp: () => ({
    policy: {
      heavyThresholdChars: 800,
      preferCloudForTasks: ["exam", "long-summary"],
      onDeviceLanguages: ["en", "ja", "es", "de", "fr"],
      cloudModel: "gemini-2.5-flash",
      onDeviceEnabled: true,
    },
    deviceAvailability: "available",
    online: true,
    userMode: "auto",
    setUserMode: vi.fn(),
    pushToast: vi.fn(),
  }),
}));

vi.mock("../src/ai/engine", () => ({ runInference: vi.fn() }));

vi.mock("../src/state/routingLog", () => ({
  logRoute: vi.fn(),
  useRoutingLog: () => [],
}));

import { runInference } from "../src/ai/engine";
import { QuizPage } from "../src/pages/QuizPage";
import { logRoute } from "../src/state/routingLog";

const mockedRun = vi.mocked(runInference);

function result(text: string, overrides: Partial<RunInferenceResult> = {}): RunInferenceResult {
  return {
    text,
    predicted: {
      inferenceMode: "prefer_on_device",
      reason: "light-task",
      degraded: false,
      explanation: "",
      diagnostics: { chars: 10, heavyThresholdChars: 800, availability: "available", online: true, taskKind: "flashcards" },
    },
    actual: "on_device",
    latencyMs: 42,
    detectedScript: null,
    ...overrides,
  };
}

function typeNotes(value: string) {
  fireEvent.change(screen.getByLabelText("Study notes"), { target: { value } });
}

// vitest globals are off, so Testing Library cannot auto-register its cleanup.
afterEach(() => cleanup());

beforeEach(() => {
  mockedRun.mockReset();
  // The page now restores a notes draft from localStorage; each test starts clean so
  // one test's typed notes cannot enable the buttons in another.
  window.localStorage.clear();
});

describe("QuizPage", () => {
  it("renders flashcards returned by the engine and reveals an answer on click", async () => {
    mockedRun.mockResolvedValue(
      result('[{"front":"Ohm law?","back":"V = IR"},{"front":"Unit of R?","back":"ohm"}]'),
    );

    render(<QuizPage />);
    typeNotes("Some lecture notes about circuits.");
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await waitFor(() => expect(screen.getByText("Ohm law?")).toBeTruthy());
    expect(screen.getByText("Unit of R?")).toBeTruthy();
    expect(screen.getByText("2 flashcards")).toBeTruthy();

    // backs are hidden until the card is activated
    expect(screen.queryByText("V = IR")).toBeNull();
    fireEvent.click(screen.getByText("Ohm law?"));
    await waitFor(() => expect(screen.getByText("V = IR")).toBeTruthy());
  });

  it("shows the raw answer instead of an error when the model does not return JSON", async () => {
    mockedRun.mockResolvedValue(result("1. Ohm's law: V = IR\n2. Kirchhoff: sum is zero"));

    render(<QuizPage />);
    typeNotes("notes");
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await waitFor(() => expect(screen.getByText(/returned prose, not JSON/i)).toBeTruthy());
    expect(screen.getByText(/Ohm's law: V = IR/)).toBeTruthy();
  });

  it("renders an exam split into its markdown sections", async () => {
    mockedRun.mockResolvedValue(
      result("## Questions\n1. What is V?\n\n## Answer key\n1. Voltage", {
        predicted: {
          inferenceMode: "prefer_in_cloud",
          reason: "heavy-task",
          degraded: false,
          explanation: "",
          diagnostics: { chars: 10, heavyThresholdChars: 800, availability: "available", online: true, taskKind: "exam" },
        },
        actual: "in_cloud",
      }),
    );

    render(<QuizPage />);
    typeNotes("notes");
    fireEvent.click(screen.getByRole("button", { name: /10-question exam/i }));

    await waitFor(() => expect(screen.getByText("Practice exam")).toBeTruthy());
    expect(screen.getByText("Questions")).toBeTruthy();
    expect(screen.getByText("Answer key")).toBeTruthy();
    expect(screen.getByText(/What is V\?/)).toBeTruthy();
  });

  it("surfaces a failure as a toast and stops the busy state", async () => {
    const { AppError } = await import("../src/ai/errors");
    mockedRun.mockRejectedValue(new AppError({ code: "QUOTA_EXCEEDED", message: "quota", hint: "wait", retryable: true }));

    render(<QuizPage />);
    typeNotes("notes");
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /flashcards/i })).toBeTruthy());
    // the button is no longer in its busy label
    expect(screen.queryByText("Generating…")).toBeNull();
  });

  it("keeps both actions disabled until there are notes", () => {
    render(<QuizPage />);
    const flashcards = screen.getByRole("button", { name: /flashcards/i }) as HTMLButtonElement;
    const exam = screen.getByRole("button", { name: /10-question exam/i }) as HTMLButtonElement;
    expect(flashcards.disabled).toBe(true);
    expect(exam.disabled).toBe(true);

    typeNotes("now there are notes");
    expect((screen.getByRole("button", { name: /flashcards/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("QuizPage failure recovery", () => {
  it("keeps the failure on screen with a retry instead of only a toast", async () => {
    mockedRun.mockRejectedValue(
      Object.assign(new Error("The on-device model did not respond."), {
        code: "DEVICE_NOT_READY",
        hint: "Wait for the download to finish, or switch Mode to Auto.",
      }),
    );

    render(<QuizPage />);
    const notes = screen.getByLabelText("Study notes");
    fireEvent.change(notes, { target: { value: "Photosynthesis converts light energy into chemical energy." } });
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await waitFor(() => expect(screen.getByText("Generation failed")).toBeTruthy());
    expect(screen.getByText(/did not respond/)).toBeTruthy();
    expect(screen.getByText(/Wait for the download to finish/)).toBeTruthy();

    // the retry runs the same task again rather than making the user start over
    mockedRun.mockResolvedValue(result('[{"front":"Q","back":"A"}]'));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(2));
  });
});

describe("QuizPage when the free tier is rate-limiting", () => {
  it("retries by itself, then shows the failure card and records one attempt", async () => {
    vi.useFakeTimers();
    const mockedRun = vi.mocked(runInference);
    const mockedLog = vi.mocked(logRoute);
    mockedRun.mockReset();
    mockedLog.mockClear();
    mockedRun.mockRejectedValue({ code: "QUOTA_EXCEEDED", message: "quota", hint: "wait" });

    render(<QuizPage />);
    fireEvent.change(screen.getByLabelText(/study notes/i), {
      target: { value: "Photosynthesis converts light energy into chemical energy in chloroplasts." },
    });
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await vi.waitFor(() => expect(screen.getByText(/retrying automatically \(attempt 2 of 3\)/i)).toBeTruthy());
    expect(mockedRun).toHaveBeenCalledTimes(1);

    // the whole budget: 20s then 45s
    await vi.advanceTimersByTimeAsync(70_000);
    expect(mockedRun).toHaveBeenCalledTimes(3);

    // one recorded attempt, and the failure card with a way out
    expect(mockedLog).toHaveBeenCalledTimes(1);
    expect(mockedLog.mock.calls[0][0]).toMatchObject({ actual: null, error: "QUOTA_EXCEEDED" });
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy());

    vi.useRealTimers();
  });
});

describe("QuizPage when the page is left mid-retry", () => {
  it("does not fire an inference nobody can see", async () => {
    vi.useFakeTimers();
    const mockedRun = vi.mocked(runInference);
    mockedRun.mockReset();
    mockedRun.mockRejectedValue({ code: "QUOTA_EXCEEDED", message: "quota", hint: "wait" });

    const { unmount } = render(<QuizPage />);
    fireEvent.change(screen.getByLabelText(/study notes/i), {
      target: { value: "Mitochondria are the site of aerobic respiration in eukaryotic cells." },
    });
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));

    await vi.waitFor(() => expect(screen.getByText(/retrying automatically/i)).toBeTruthy());
    expect(mockedRun).toHaveBeenCalledTimes(1);

    unmount();
    await vi.advanceTimersByTimeAsync(120_000);

    // the armed retry must have been cancelled with the component
    expect(mockedRun).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("QuizPage when the user moves on during a retry wait", () => {
  it("does not let the stale retry replace the new request", async () => {
    vi.useFakeTimers();
    const mockedRun = vi.mocked(runInference);
    mockedRun.mockReset();
    mockedRun
      .mockRejectedValueOnce({ code: "QUOTA_EXCEEDED", message: "quota", hint: "wait" })
      .mockResolvedValue({
        text: "**Q1** What is the site of aerobic respiration?\nANSWER: Mitochondria",
        predicted: {
          inferenceMode: "prefer_in_cloud",
          reason: "heavy-task",
          degraded: false,
          explanation: "cloud",
          diagnostics: { chars: 60, heavyThresholdChars: 800, taskKind: "exam" },
        },
        actual: "in_cloud",
        latencyMs: 300,
        detectedScript: "latin",
        fallbackReason: null,
        modelUsed: "gemini-3.6-flash",
      } as RunInferenceResult);

    render(<QuizPage />);
    fireEvent.change(screen.getByLabelText(/study notes/i), {
      target: { value: "Mitochondria are the site of aerobic respiration in eukaryotic cells." },
    });

    // flashcards fails and arms a retry
    fireEvent.click(screen.getByRole("button", { name: /flashcards/i }));
    await vi.waitFor(() => expect(screen.getByText(/retrying automatically/i)).toBeTruthy());

    // the user gives up on that and asks for an exam instead
    fireEvent.click(screen.getByRole("button", { name: /10-question exam/i }));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(2));

    // the armed retry must not fire now and overwrite the exam
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockedRun).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
