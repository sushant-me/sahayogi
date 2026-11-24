// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { clearQuizSnapshot, readQuizSnapshot, writeQuizSnapshot } from "../src/state/quizStore";

const sample = {
  task: "exam" as const,
  cards: null,
  exam: "1. What is photosynthesis?",
  rawFallback: null,
  meta: {
    mode: "only_in_cloud" as const,
    actual: "in_cloud" as const,
    reason: "device-not-ready" as const,
    latencyMs: 81133,
  },
};

beforeEach(() => window.localStorage.clear());

describe("quiz snapshot", () => {
  it("round-trips the generated material with its routing evidence", () => {
    writeQuizSnapshot(sample);
    const restored = readQuizSnapshot();
    expect(restored?.exam).toBe("1. What is photosynthesis?");
    expect(restored?.meta?.actual).toBe("in_cloud");
    expect(restored?.meta?.latencyMs).toBe(81133);
    expect(typeof restored?.at).toBe("number");
  });

  it("clears", () => {
    writeQuizSnapshot(sample);
    clearQuizSnapshot();
    expect(readQuizSnapshot()).toBeNull();
  });

  it("ignores a snapshot from an older or broken shape instead of crashing", () => {
    window.localStorage.setItem("sahayogi.quiz.result", "{not json");
    expect(readQuizSnapshot()).toBeNull();

    window.localStorage.setItem("sahayogi.quiz.result", JSON.stringify({ nope: true }));
    expect(readQuizSnapshot()).toBeNull();
  });

  it("survives storage that refuses to write", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => writeQuizSnapshot(sample)).not.toThrow();
    window.localStorage.setItem = original;
  });
});
