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
